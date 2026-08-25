# 33 — Public REST API and webhooks

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0052-public-api-and-webhooks.md`
- **Depends on:** every module it exposes (04_issues, 03_projects, 08_comments,
  14_user_management), 15_roles, ADR-0028 (rate limiting), ADR-0051 (the tick)

## 1. Overview

`/api/v1/*` — a stable, versioned, token-authenticated projection of the
product, plus outbound webhooks so integrations can react instead of poll.

Scope: personal access tokens with scopes, read/write on projects, issues,
comments and users, cursor pagination, per-token rate limits, and signed
webhooks with retry and auto-disable. Not: OAuth, GraphQL, bulk endpoints,
per-field scopes, official SDKs.

**The one rule that governs the whole module:** `/api/v1` is a *contract*.
Everything else in this codebase has one client and can change freely. This
cannot.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | `/api/v1` is **separate from the app's own `/api/*`**. Same services underneath, different route layer, auth, envelope and versioning promise. Pointing integrators at internal routes would make every UI refactor someone's breaking change. |
| BR-2 | A token **acts as its owner and can never exceed them**. Every call resolves an `Actor` and goes through the permission engine (ADR-0024), so a MEMBER's token cannot do LEAD things and no token crosses an organization (F-1). |
| BR-3 | Scopes **narrow, never widen**: `projects:read`, `issues:read`, `issues:write`, `comments:write`, `webhooks:manage`. Coarse by decision — per-field scopes are configured wrong by everybody and the false confidence is worse than the honest version. |
| BR-4 | A token is stored **hashed**. The secret is shown exactly once, at creation, and is unrecoverable after. Format `eag_<publicId>_<secret>`: the prefix for secret scanners, the public id for an indexed lookup, the secret hashed. |
| BR-5 | Every list is **cursor-paginated** — `{ data, pagination: { nextCursor, hasMore } }`. No offset and no total: offset re-scans and silently skips rows as data changes, which is why Jira had to migrate its own search endpoints off `startAt`. |
| BR-6 | **One envelope.** `{ data }` on success, `{ error: { code, message, details? } }` on failure. `code` is a stable machine string; `message` is prose and may be reworded at any time. |
| BR-7 | **Rate limit headers on every response**, not just 429s, and limits are **per token**. A client that can only discover the limit by exceeding it will exceed it, then retry immediately. |
| BR-8 | Webhook payloads are **signed**: `X-Eagles-Signature: sha256=<hex>` HMAC over the **raw body**, plus `X-Eagles-Timestamp`. The timestamp is inside the signed material — signing without it leaves a captured request replayable forever. |
| BR-9 | Delivery is **queued and retried**: written when the event happens, attempted once inline after the primary write commits, then retried with exponential backoff by the existing scheduler tick (ADR-0051). A webhook may never slow or fail the user's action. |
| BR-10 | A webhook is **auto-disabled after 10 consecutive failures**, with the reason recorded. Disabled, not deleted — the configuration survives to be fixed. |
| BR-11 | Events are `resource.action` and carry a **full snapshot** of the resource at event time, not a bare id. Documented as a snapshot: it can be stale by the time it lands. |
| BR-12 | Tokens are **personal**; webhooks are **per organization**, managed by an org ADMIN. A webhook fires only for events its owner's organization can see. |
| BR-13 | Every write goes through the **same service** the UI calls, so required custom fields, transition rules, the subtask-done guard and every notification still apply. |
| BR-14 | `lastUsedAt` is recorded per token. An API surface with no way to answer "is this token still in use" cannot be safely cleaned up. |

## 3. Database

```prisma
model ApiToken {
  id             String    @id @default(cuid())
  organizationId String
  userId         String    // acts as this person (BR-2)
  name           String
  /// The lookup half of `eag_<publicId>_<secret>` — indexed, not secret.
  publicId       String    @unique
  /// SHA-256 of the secret half. Never reversible, never displayed (BR-4).
  secretHash     String
  scopes         String[]
  lastUsedAt     DateTime?
  expiresAt      DateTime?
  revokedAt      DateTime?
  // + audit fields
}

model Webhook {
  id             String    @id @default(cuid())
  organizationId String
  url            String
  /// Shown once. The receiver's half of the HMAC (BR-8).
  secret         String
  events         String[]
  active         Boolean   @default(true)
  consecutiveFailures Int  @default(0)
  disabledReason String?
  // + audit fields
}

model WebhookDelivery {
  id          String   @id @default(cuid())
  webhookId   String
  event       String
  payload     Json
  status      WebhookDeliveryStatus  // PENDING | SUCCEEDED | FAILED
  attempts    Int      @default(0)
  /// When the scheduler should try again. Null once settled.
  nextAttemptAt DateTime?
  responseCode  Int?
  error         String?
  createdAt   DateTime @default(now())
  @@index([status, nextAttemptAt])
}
```

## 4. API

Base `/api/v1`. `Authorization: Bearer eag_…`.

| Method | Path | Scope |
|---|---|---|
| `GET` | `/me` | any |
| `GET` | `/projects` | `projects:read` |
| `GET` | `/projects/{id}` | `projects:read` |
| `GET` | `/projects/{id}/issues` | `issues:read` |
| `POST` | `/projects/{id}/issues` | `issues:write` |
| `GET` | `/issues/{idOrKey}` | `issues:read` |
| `PATCH` | `/issues/{idOrKey}` | `issues:write` |
| `DELETE` | `/issues/{idOrKey}` | `issues:write` |
| `GET` | `/issues/{idOrKey}/comments` | `issues:read` |
| `POST` | `/issues/{idOrKey}/comments` | `comments:write` |
| `GET` | `/users` | `projects:read` |
| `GET`/`POST` | `/webhooks` | `webhooks:manage` |
| `GET`/`PATCH`/`DELETE` | `/webhooks/{id}` | `webhooks:manage` |
| `GET` | `/webhooks/{id}/deliveries` | `webhooks:manage` |

Issues are addressable by **id or key** (`VWP-1301`), because the key is what a
human has in front of them.

## 5. Events

| Event | Fires when |
|---|---|
| `issue.created` | An issue is created, by anyone or anything |
| `issue.updated` | Fields change, including status |
| `issue.deleted` | An issue is soft-deleted |
| `comment.created` | A comment is posted |

Payload:

```json
{
  "event": "issue.updated",
  "deliveryId": "…",
  "occurredAt": "2026-08-22T14:03:00.000Z",
  "organizationId": "…",
  "data": { "…the resource, as it was at event time (BR-11)…" }
}
```

Verification, in full:

```js
const expected = crypto
  .createHmac("sha256", secret)
  .update(`${req.headers["x-eagles-timestamp"]}.${rawBody}`)
  .digest("hex");
// Constant-time, and reject a timestamp outside ±5 minutes.
```

## 6. UI

Settings → **Developer**.

- **Tokens** — name, scopes, last used, expiry. The secret appears once, on a
  screen that says so plainly, with a copy button.
- **Webhooks** — URL, events, active toggle, signing secret (shown once), and
  the disabled reason when auto-disabled.
- **Deliveries** — per webhook: event, status, attempts, response code, error.
  The first thing anybody debugging an integration asks for.

## 7. Acceptance Criteria

1. A valid token authenticates; a malformed, unknown, revoked or expired one is
   `401` with `code: "unauthorized"`.
2. A token missing the scope gets `403 insufficient_scope` naming the scope.
3. A MEMBER's token cannot perform a LEAD-only action, even with the scope.
4. Another organization's resource is `404`, never `403` (F-1).
5. Listing pages by cursor, and the same cursor twice returns the same page.
6. Rate limit headers appear on a 200; exceeding the limit gives `429` with
   `Retry-After`.
7. Creating an issue over the API fires `issue.created` to a subscribed webhook,
   signed and verifiable.
8. A webhook whose endpoint fails is retried with backoff, and disabled after 10
   consecutive failures with the reason recorded.
9. A delivery's signature verifies against the documented recipe, and a body
   altered in transit fails it.
10. `lastUsedAt` advances when a token is used.
11. Writes over the API obey every rule the UI obeys — required custom fields,
    transition restrictions, the subtask-done guard.

## 8. Future Scope

OAuth 2.0 and third-party apps, GraphQL, `Idempotency-Key` on writes, per-field
scopes, bulk endpoints, official SDKs, a sandbox org, webhook event filtering by
query, and org-level (rather than personal) service tokens.
