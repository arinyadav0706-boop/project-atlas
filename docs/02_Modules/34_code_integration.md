# 34 — Code integration

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0053-code-integration.md`
- **Depends on:** 04_issues, 03_projects (keys are the routing), 30_workflow
  (a transition target is a status), 15_roles, ADR-0052 (the webhook patterns
  this reuses inbound)

## 1. Overview

Put an issue key in a branch name, commit message or merge-request title and it
shows up on the issue — the same behaviour Jira, ClickUp and Asana all ship.

Scope: an org-level connection per git host, an inbound webhook endpoint,
branch/commit/merge-request links, pipeline status, an optional transition when
a merge request merges, and a Development panel on the issue. **GitLab is the
first provider; the design is provider-agnostic** (ADR-0053 §1).

Not: replacing the git host, outbound calls to it, smart-commit commands,
backfilling history.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | A provider is an **interface**, and **verification is part of it**. GitLab sends its secret verbatim in `X-Gitlab-Token`; GitHub sends an HMAC in `X-Hub-Signature-256`. A shared verifier would have to be rewritten for the second provider, which is the thing "agnostic" exists to prevent. |
| BR-2 | Events route by **issue key**, not by a repo→project mapping. `VWP-123` already names the project, so there is no configuration to set up, drift, or get wrong when a repo is renamed. |
| BR-3 | Candidate keys are matched against the organization's **real project keys**. A generic `[A-Z]+-\d+` links `UTF-8`, `ISO-8601`, `SHA-256` and `CVE-2026-1234`. A wrong link is worse than a missing one: it is noise somebody has to investigate, and after the second one they stop reading the panel. |
| BR-4 | Everything downstream sees one normalised **`CodeEvent`**. If the word "gitlab" appears outside the adapter and the registry, the seam has leaked. |
| BR-5 | Links are **upserted** on `(provider, kind, externalId, issueId)`. Providers retry and re-deliver; the same merge request must not appear four times. |
| BR-6 | A merge request's **state is updated in place** — opened, merged, closed. The panel shows what is true now, not a history of notifications. |
| BR-7 | Auto-transition on merge is **off by default**, and when on the target status is chosen explicitly (a project may have three DONE statuses). It goes through `IssueService`, so transition rules, the subtask-done guard and notifications all apply. |
| BR-8 | Everything is **best-effort with respect to the sender**: a webhook that cannot be processed is answered `200` with a reason, never a 5xx. A git host that sees errors disables the hook, and then nothing works and nobody knows why. |
| BR-9 | An event naming an issue in **another organization** links nothing. Key lookup is scoped to the connection's org (F-1). |
| BR-10 | Connections are **org-level, org ADMIN only**. A connection holds a secret; a project lead configuring one opens a channel into the whole organization. |
| BR-11 | The secret is shown **once**, on creation, with the webhook URL beside it — the two things needed to configure the other end, together, at the moment somebody is doing it. |
| BR-12 | **No outbound calls to the provider.** The payload carries branch, commits, merge request, state and URL. An access token that can read the company's source is a large surface for a nicer avatar (ADR-0053 §7). |
| BR-13 | Anyone who can see an issue can see its Development panel. Code links are metadata about work, not a second permission system. |

## 3. Database

```prisma
enum CodeProvider {
  GITLAB
}

enum CodeLinkKind {
  BRANCH
  COMMIT
  MERGE_REQUEST
}

enum CodeLinkState {
  OPEN
  MERGED
  CLOSED
  /// Branches and commits have no lifecycle of their own.
  NONE
}

model CodeConnection {
  id             String       @id @default(cuid())
  organizationId String
  name           String
  provider       CodeProvider @default(GITLAB)
  /// Self-managed GitLab is the common case, so the host is data, not config.
  baseUrl        String
  /// Verified per provider (BR-1). Shown once (BR-11).
  secret         String
  active         Boolean      @default(true)
  /// BR-7. Null means "do nothing on merge", which is the default.
  onMergeStatusId String?
  lastEventAt    DateTime?
  // + audit fields, deletedAt
}

model CodeLink {
  id           String        @id @default(cuid())
  issueId      String
  connectionId String
  provider     CodeProvider
  kind         CodeLinkKind
  /// Provider-side identity: MR iid, commit sha, branch name.
  externalId   String
  title        String
  url          String
  state        CodeLinkState @default(NONE)
  authorName   String?
  repository   String
  /// Latest pipeline status for this ref, when the provider reports one.
  pipelineStatus String?
  occurredAt   DateTime
  // + audit fields

  @@unique([issueId, provider, kind, externalId])
  @@index([issueId])
}
```

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/integrations/code/{connectionId}` | The inbound endpoint. Verified per provider; always answers 200 (BR-8). |
| `GET` | `/api/admin/code-connections` | List connections (org ADMIN). |
| `POST` | `/api/admin/code-connections` | Create one; the response carries the secret and webhook URL, once. |
| `PATCH` | `/api/admin/code-connections/{id}` | Rename, activate, set the on-merge status. |
| `DELETE` | `/api/admin/code-connections/{id}` | Soft-delete. |
| `GET` | `/api/issues/{issueId}/code-links` | The Development panel's data. |

## 5. What GitLab sends, and what we make of it

| GitLab hook | Normalised as | Produces |
|---|---|---|
| `Push Hook` | `PUSH` | A `BRANCH` link for the ref, a `COMMIT` link per commit whose message names a key |
| `Merge Request Hook` | `MERGE_REQUEST` | A `MERGE_REQUEST` link, state tracking `opened`/`merged`/`closed`, and the transition on merge |
| `Pipeline Hook` | `PIPELINE` | Updates `pipelineStatus` on links for that ref |

Keys are read from the **branch name, each commit message, and the merge
request's title and description**.

## 6. UI

- **Issue → Development panel** — branches, commits and merge requests, each
  with state and a link out. Empty state explains the convention, because a
  feature nobody knows the trigger for is a feature nobody uses.
- **Admin → Code** — connections, each showing its webhook URL, the events to
  subscribe to, and the on-merge behaviour.

## 7. Acceptance Criteria

1. A push to `feature/VWP-1 login` creates a branch link on VWP-1.
2. A commit message naming two keys links to both issues.
3. `UTF-8`, `ISO-8601` and `CVE-2026-1234` link to nothing.
4. A merge request opened, then merged, is **one** link whose state changes.
5. The same delivery replayed changes nothing (BR-5).
6. With `onMergeStatusId` set, merging moves the issue; without it, nothing moves.
7. A merge that the project's transition rules forbid is refused, logged, and
   does not fail the webhook.
8. A wrong or missing secret is `401`; a valid secret with an unparseable body
   is `200` with a reason (BR-8).
9. A key belonging to another organization links nothing.
10. Only an org ADMIN can create a connection; the secret is returned once.
11. Any member who can see the issue sees its panel.

## 8. Future Scope

GitHub (the adapter this design exists for), Bitbucket, smart-commit commands
(`#close`, `#time 2h`), posting back to the provider, backfilling history on
connect, repository↔project links as first-class metadata, CI status as its own
concept, and OAuth connections instead of a shared secret.
