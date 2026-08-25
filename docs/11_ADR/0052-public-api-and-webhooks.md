# ADR-0052 — Public REST API and webhooks

- **Status:** Accepted
- **Date:** 2026-08-22
- **Module:** `docs/02_Modules/33_public_api.md`
- **Relates to:** ADR-0024 (permission engine), ADR-0028 (rate limiting),
  ADR-0051 (the scheduler tick), ADR-0050 (automations), ADR-0011 (optimistic
  concurrency), ADR-0004 (portability)

## Context

The roadmap's one hard sequencing rule: **the public API ships before anything
built on top of it.** Slack and GitHub integrations are queued behind this, and
building either first would mean building its API foundation twice.

This is also the first thing EAGLES ships that is a **contract**. Every module
so far has had exactly one client — our own UI — and could be changed freely.
An API somebody's payroll export depends on cannot. That difference, not the
endpoint list, is what this ADR is about.

Jira, ClickUp and Asana have each been through the resulting mistakes in
public. Two are worth copying deliberately:

- **Jira deprecated `startAt` offset pagination** in favour of an opaque
  `nextPageToken` on its search endpoints, and forced every integrator through
  a painful migration. Offset paging on a large, changing table re-scans on
  every page and silently skips or repeats rows as data moves under it.
- **ClickUp and Asana both HMAC-sign webhook bodies** (`X-Signature`,
  `X-Hook-Signature`). An unsigned webhook is an unauthenticated POST endpoint
  on the customer's server that anyone who learns the URL can forge.

## Decision

### 1. `/api/v1/*` is a separate surface from the app's own `/api/*`

Same services underneath; different route layer, auth, response shape and
versioning promise.

This is the decision everything else depends on. The internal routes exist to
serve our React components and change whenever a component does — the Calendar's
route was reshaped twice while the view was being built. If integrators were
pointed at those, every internal refactor would be a breaking change for
somebody, and the practical result is that internal refactors stop happening.

So `/api/v1` is a deliberate, narrower, stable projection. `v1` in the path
rather than a header: it is greppable in a customer's codebase, obvious in a
log line, and copy-pasteable into curl — which no `Accept:
application/vnd.eagles.v1+json` scheme has ever been.

### 2. Personal Access Tokens, hashed at rest — not OAuth, yet

All three competitors shipped tokens first and still support them, because the
overwhelming majority of API use is a script owned by one person. OAuth exists
for third-party apps acting on behalf of *other* users, which is a marketplace
problem we do not have (tracked, API-6).

Format: `eag_<publicId>_<secret>`.

Three properties, each earning its place. The **`eag_` prefix** makes tokens
recognisable to secret scanners and to a human reading a log — GitHub's
`ghp_` convention exists because unprefixed tokens are indistinguishable from
noise. The **public id** makes lookup an indexed point read; without it,
verifying a token means bcrypt-comparing against every row. Only the **secret**
is hashed, and it is shown exactly once — a token store that can display its own
secrets is a breach waiting for one bad export.

### 3. A token can never do more than its owner can

The token acts *as the user*. Every service call goes through the same
`Actor` and the same permission engine (ADR-0024), so a MEMBER's token cannot
do LEAD things, and a token cannot reach another organization's data.

Scopes narrow further, never widen. They are **coarse and read/write split** —
`projects:read`, `issues:read`, `issues:write`, `comments:write`,
`webhooks:manage`. Per-field scopes are a governance fantasy: nobody configures
them correctly, and the false confidence is worse than the coarse honest
version. Notably this is already *stronger* than ClickUp and Asana, whose
personal tokens are all-or-nothing.

### 4. Cursor pagination everywhere, from day one

Not offset. Jira's forced migration is the evidence: `startAt` on a large table
re-scans every preceding row per page, and — worse — a list that changes while
you page through it silently skips and repeats items, so a nightly export is
quietly wrong rather than loudly broken.

Every list returns `{ data, pagination: { nextCursor, hasMore } }`. No total
count: a total on a filtered, permission-scoped query is a second expensive
aggregate that most callers ignore, and Jira dropped `totalIssues` from its new
endpoint for exactly that reason.

### 5. One envelope, one error shape, no exceptions

`{ "data": … }` for everything, `{ "error": { code, message, details? } }` when
it fails. Asana's shape. Chosen over bare objects because it leaves room to add
top-level fields later without breaking a parser — which is the entire job of a
versioned contract.

`code` is a stable machine string (`not_found`, `forbidden`,
`validation_failed`, `rate_limited`); `message` is for a human and may be
reworded any time. Clients that branch on prose are clients we broke.

### 6. Rate limit headers on every response, not only on 429

`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` always;
`Retry-After` additionally on a 429. A client that can only discover the limit
by exceeding it *will* exceed it, and then retry immediately, which is how a
polite integration becomes an outage. Limits are **per token**, so one team's
runaway script cannot exhaust another's budget.

The existing DB-backed limiter (ADR-0028) is reused as-is — portable, shared
across serverless instances, already atomic.

### 7. Webhooks are signed, with a timestamp

`X-Eagles-Signature: sha256=<hex>` over the **raw body**, plus
`X-Eagles-Timestamp`. The receiver recomputes the HMAC with its secret and
rejects anything outside a tolerance window.

Signing alone is not enough, which is the part most implementations get wrong:
without a timestamp in the signed material, a captured request can be replayed
forever. Signing the raw bytes rather than a re-serialised object matters too —
any difference in key order or whitespace between our serialiser and theirs
would break every verification.

### 8. Delivery is queued and retried by the scheduler that already exists

A delivery row is written when the event happens, attempted once inline
(best-effort, after the primary write commits), and retried with exponential
backoff by the **existing tick** from ADR-0051. No queue, no worker, no new
infrastructure — the same portability argument, and the tick is already
idempotent and already deployed.

The alternative, firing synchronously and hoping, makes every user action as
slow as the slowest customer endpoint and loses the event when it times out.

### 9. A webhook that keeps failing is switched off, and says why

After a run of consecutive failures the webhook is disabled with the reason
recorded. ClickUp and Asana both do this; Asana deletes outright after 24 hours
of failure. Disabling rather than deleting is the kinder version — the
configuration survives so it can be fixed and re-enabled.

Without it, one customer's decommissioned endpoint absorbs retries forever, and
the delivery log fills with the same error until it is useless for anything else.

### 10. Events are `resource.action`, and carry a full snapshot

`issue.created`, `issue.updated`, `issue.deleted`, `comment.created`. Flat,
boring, guessable — a name nobody has to look up is worth more than a clever
taxonomy.

The payload carries the resource as it was at event time, not a bare id.
A thin "come and fetch it" event doubles the round trips and races with the next
change; the cost is that the snapshot can be stale by the time it arrives, which
is documented rather than hidden.

## Consequences

**Good.** The integration foundation exists, so Slack and GitHub become
ordinary features rather than rewrites. Internal routes stay free to change.
Every business rule still applies, because the API calls the same services the
UI does. Webhook delivery reuses a scheduler that is already there.

**Costs.** A second route layer to keep in step with the first. `v1` is a
promise: once someone depends on it, changing it needs a `v2` and a deprecation
window. No OAuth, so no third-party app can act for another user. No
`Idempotency-Key`, so a retried POST can double-create — which none of the three
competitors solve either, and which is tracked (API-7). The tick's cadence
bounds webhook retry latency.

**Not decided here.** OAuth 2.0 and a third-party app model, GraphQL,
`Idempotency-Key`, per-field scopes, bulk endpoints, a sandbox environment,
official client SDKs, and webhook event filtering by JQL-style query.
