# 35 — Code backfill

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0054-backfill-and-provider-auth.md`
- **Depends on:** 34_code_integration (the links, the adapters, the linking
  service this reuses), 32_recurring (the scheduler tick), 15_roles, ADR-0011
  (the conditional-update claim)

## 1. Overview

Connect a repository and the history that already mentions your issues appears
on them — the same thing Jira's DVCS sync, ClickUp's repo import and Asana's
pull-request sync do on connect.

Scope: authenticating to the git host through a provider app, listing its
repositories, choosing which to scan, walking their merge/pull requests,
branches and commits within a bounded window, and writing links **through the
existing linking service** so a backfilled link is the same row a webhook would
have written.

Not: posting anything back to the git host, creating branches, smart-commit
commands, or re-syncing on a schedule (re-sync is on demand).

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | Authentication is a **provider app install** — a GitHub App, a GitLab OAuth application — never a pasted personal token. A PAT carries a person's access, outlives their employment, and is revoked in a place nobody audits (ADR-0054 §1). |
| BR-2 | Getting a token is **part of the provider interface**, like verification is. GitHub mints an installation token from a JWT signed with the app key; GitLab exchanges an authorization code and then refreshes. No shared "get a token" function can hold both. |
| BR-3 | **GitLab's refresh token rotates on every use.** The new pair is persisted **before** the access token is used for anything, because a lost write is a permanently dead connection, not a retryable error. |
| BR-4 | Tokens are **encrypted at rest** (AES-256-GCM, key from `CREDENTIAL_ENCRYPTION_KEY`, version-prefixed so the key can rotate). A plaintext refresh token turns a database dump into a source-code credential. |
| BR-5 | A **repository row is a work list, not a mapping.** It says "scan this"; it never says which EAGLES project a repo belongs to. Routing is still by issue key (34/BR-2). Adding `projectId` to that table would break ADR-0054 §4. |
| BR-6 | Backfill writes links through the **same `linkEvent`** the webhook path uses. Two writers would drift, and a backfilled merge request would slowly stop looking like a webhooked one. |
| BR-7 | Therefore backfill honours 34/BR-2 exactly: a commit is linked only when **its own message** names the key, even if the branch it sits on matches. |
| BR-8 | A run is **claimed with a conditional update** and carries a **phase + cursor**. Two overlapping ticks share the work; a run interrupted at minute 30 resumes at minute 30, not at zero. |
| BR-9 | Backfill is **bounded** — 90 days by default, per connection, admin-settable. Unbounded is not something a monorepo survives. |
| BR-10 | Rate limits are **obeyed**: stop when remaining quota is low, honour `Retry-After` exactly, back off on 5xx, and leave the cursor. A throttled installation breaks the webhook path too, so the feature would damage the feature it completes. |
| BR-11 | A paused run is **not a failure**. "Resuming in 42 minutes" is a status the UI shows plainly; showing an error would send somebody to debug a working system. |
| BR-12 | **"Run now" and the scheduler call the same function.** The button drains one slice synchronously so the feature works on a deployment whose cron is unconfigured (GL-10). |
| BR-13 | Backfill is **org ADMIN only**, like the connection it belongs to (34/BR-10). It reads the company's source. |
| BR-14 | The OAuth `state` is **single-use, bound to the connection, and expires**. Without it, a crafted callback attaches an attacker's install to somebody else's connection. |
| BR-15 | The provider's base URL is **SSRF-guarded, but not with the webhook guard.** Outbound webhooks refuse every private address; a self-managed GitLab at `10.0.x.x` or `gitlab.corp.internal` is the deployment this product supports, so refusing those would break the feature for the people most likely to want it. The provider guard therefore blocks **loopback and the cloud metadata endpoints** (`169.254.169.254`, `metadata.google.internal`, `fd00:ec2::254`) always, and allows RFC1918 — those are the addresses where a bearer token in a request header turns into stolen cloud credentials. Response bodies are never echoed to the UI, so a probe returns nothing either way. |

## 3. Database

```prisma
enum CodeAuthMode {
  /// Inbound webhooks only — what every connection was before this module.
  WEBHOOK_ONLY
  /// A provider app is installed and a credential exists.
  APP
}

enum BackfillStatus {
  QUEUED
  RUNNING
  /// Rate-limited or out of tick budget. Not an error (BR-11).
  PAUSED
  SUCCEEDED
  FAILED
  CANCELLED
}

enum BackfillPhase {
  MERGE_REQUESTS
  BRANCHES
  COMMITS
  DONE
}

model CodeCredential {
  id           String   @id @default(cuid())
  connectionId String   @unique
  /// Ciphertext, never a token (BR-4).
  accessToken  String
  refreshToken String?
  expiresAt    DateTime?
  scope        String?
  /// GitHub: the installation the app was added to. GitLab: null.
  installationId String?
  externalAccount String?
  // + audit fields
}

model CodeRepository {
  id           String   @id @default(cuid())
  connectionId String
  /// Provider-side id, stable across renames.
  externalId   String
  /// `owner/repo` or `group/project`, for display and for URLs.
  path         String
  defaultBranch String?
  /// Only enabled repositories are scanned (BR-5).
  enabled      Boolean  @default(false)
  lastBackfillAt DateTime?
  // + audit fields

  @@unique([connectionId, externalId])
}

model CodeBackfillRun {
  id           String         @id @default(cuid())
  repositoryId String
  status       BackfillStatus @default(QUEUED)
  phase        BackfillPhase  @default(MERGE_REQUESTS)
  /// Where to resume (BR-8). Shape is the client's business.
  cursor       Json?
  /// The window's start — everything older is out of scope (BR-9).
  since        DateTime
  scanned      Int      @default(0)
  linked       Int      @default(0)
  /// Set while rate-limited, so the UI can say when it resumes (BR-11).
  resumeAfter  DateTime?
  error        String?
  startedAt    DateTime?
  finishedAt   DateTime?
  /// The conditional-update claim (ADR-0011).
  version      Int      @default(0)
  // + audit fields
}
```

`CodeConnection` gains `authMode` and `backfillDays`.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/admin/code-connections/{id}/authorize` | Start the install; redirects to the provider with a single-use state (BR-14). |
| `GET` | `/api/integrations/code/callback` | The provider's redirect target. Exchanges the code, stores the credential, returns to the admin screen. |
| `DELETE` | `/api/admin/code-connections/{id}/credential` | Disconnect: drop the credential, back to `WEBHOOK_ONLY`. |
| `GET` | `/api/admin/code-connections/{id}/repositories` | What the install can see, plus which are enabled. |
| `PATCH` | `/api/admin/code-connections/{id}/repositories` | Enable/disable repositories to scan. |
| `POST` | `/api/admin/code-connections/{id}/backfill` | Queue a run per enabled repository, and drain one slice now (BR-12). |
| `GET` | `/api/admin/code-connections/{id}/backfill` | Run status and history. |
| `POST` | `/api/scheduler/tick` | Existing endpoint; now drains backfill too. |

## 5. What a run does

1. **MERGE_REQUESTS** — every merge/pull request updated since the window start,
   newest first. Title and description searched; state mapped by the adapter's
   own vocabulary (34/BR-14).
2. **BRANCHES** — every branch whose **name** contains a known key.
3. **COMMITS** — commits on those branches since the window start, each linked
   only if **its own message** names a key (BR-7).
4. **DONE** — `lastBackfillAt` set; the run is `SUCCEEDED`.

Each phase pages until the provider says there is no more, persisting the cursor
as it goes. Out of budget or rate-limited → `PAUSED` with `resumeAfter`, cursor
intact.

## 6. UI

- **Admin → Code → a connection** — "Connect" when `WEBHOOK_ONLY`; when
  connected, the account it is installed on, a repository list with checkboxes,
  the window in days, and a "Backfill now" button.
- **Run status** — per repository: phase, counts scanned/linked, and for a
  paused run the plain sentence about when it resumes (BR-11).
- No provider names in the components, same as the connection picker (34/BR-4).

## 7. Acceptance Criteria

1. Starting an install redirects to the provider's authorize URL with a state
   that is single-use — replaying the callback fails (BR-14).
2. A callback whose state belongs to another connection is refused.
3. An exchanged credential is stored as ciphertext; the plaintext token appears
   in no column, and tampering with the ciphertext is detected, not decrypted.
4. An expired GitHub installation token is re-minted transparently; nothing
   above the credential seam notices.
5. A GitLab refresh **rotates** the refresh token, and the new one is persisted
   before use (BR-3).
6. Backfill links a merge request, a branch, and only those commits whose own
   messages name a key (BR-6, BR-7).
7. A backfilled link and a webhook link for the same merge request are **one
   row** — replay either way changes nothing.
8. `UTF-8`, `ISO-8601`, `CVE-2026-1234` in historical commits link nothing.
9. Nothing older than the window is scanned (BR-9).
10. A rate-limited response pauses the run with `resumeAfter`, leaves the cursor,
    and the next tick continues from it — no re-scan, no duplicate (BR-8, BR-10).
11. A run interrupted mid-phase resumes at that phase and cursor.
12. Two concurrent ticks do not double-process one run (BR-8).
13. "Run now" makes progress on a deployment with no scheduler configured (BR-12).
14. A non-admin cannot start an install, change repositories, or run a backfill.
15. A connection in another organization is 404, not 403.

## 8. Future Scope

Posting back to the provider, "Create branch" from an issue, smart-commit
commands, scheduled re-sync, Bitbucket and Azure DevOps, per-repository access
control, and importing a provider's own issue links.
