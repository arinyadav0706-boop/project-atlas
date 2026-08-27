# 34 — Code integration

- **Status:** v1.1 — V2 module (v1.1 adds the GitHub provider)
- **ADR:** `docs/11_ADR/0053-code-integration.md`
- **Depends on:** 04_issues, 03_projects (keys are the routing), 30_workflow
  (a transition target is a status), 15_roles, ADR-0052 (the webhook patterns
  this reuses inbound)

## 1. Overview

Put an issue key in a branch name, commit message or merge-request title and it
shows up on the issue — the same behaviour Jira, ClickUp and Asana all ship.

Scope: an org-level connection per git host, an inbound webhook endpoint,
branch/commit/merge-request links, pipeline status, an optional transition when
a merge request merges, and a Development panel on the issue. **GitLab and
GitHub are both supported; a third provider is one adapter file** (ADR-0053 §1,
§9). Self-managed GitLab and GitHub Enterprise work, because a connection
carries its own host URL, and an organization can run both at once — the panel
shows links from both on the same issue.

Not: replacing the git host, outbound calls to it, smart-commit commands,
backfilling history.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | A provider is an **interface**, and **verification is part of it**. GitLab sends its secret verbatim in `X-Gitlab-Token`; GitHub sends an HMAC-SHA256 of the raw body in `X-Hub-Signature-256`. Both are compared in constant time. A shared verifier would have had to be rewritten for the second provider, which is the thing "agnostic" exists to prevent. |
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
| BR-14 | **Merged is read in each provider's own vocabulary.** GitLab says `state: "merged"`. GitHub has no merged state: a merged pull request is `state: "closed"` with `merged: true`. Reading `state` alone would show every merged GitHub PR as Closed and would never fire BR-7 — wrong only in the one case anybody cares about, which is why it is a rule and a test rather than a reviewer's attention. |
| BR-15 | **Signature verification reads the raw body, never a re-serialised one.** `JSON.parse` then `JSON.stringify` changes key order and whitespace, so the HMAC would never match. The endpoint reads the body as text once and hands the same string to both `verify` and `parse`. |

## 3. Database

```prisma
enum CodeProvider {
  GITLAB
  GITHUB
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

## 5. What each provider sends, and what we make of it

Three normalised kinds, and everything downstream sees only those (BR-4).

| Normalised | GitLab hook | GitHub event | Produces |
|---|---|---|---|
| `PUSH` | `Push Hook` | `push` | A `BRANCH` link for the ref, a `COMMIT` link per commit **whose own message** names a key |
| `MERGE_REQUEST` | `Merge Request Hook` | `pull_request` | One `MERGE_REQUEST` link whose state tracks open → merged/closed, and the transition on merge |
| `PIPELINE` | `Pipeline Hook` | `check_suite` | Updates `pipelineStatus` on the links for that ref |

Keys are read from the **branch name, each commit message, and the merge
request's title and description** — identical for both providers, because the
adapter has already normalised them.

Everything else a provider sends — GitLab note/issue/wiki/tag hooks, GitHub
`ping`/`issues`/`release`, a branch deletion, a tag push — normalises to
nothing and is answered 200 (BR-8).

### 5.1 Where the two providers disagree

All of it lives inside the adapters; nothing below is visible to the service,
the panel, or any test outside `lib/`.

| | GitLab | GitHub |
|---|---|---|
| Verification | secret verbatim, `X-Gitlab-Token` | HMAC-SHA256 of the raw body, `X-Hub-Signature-256: sha256=…` |
| Which event is this? | `object_kind` in the body (header is a fallback) | `X-GitHub-Event` **header only** |
| Merged | `state: "merged"` | `state: "closed"` **+ `merged: true`** (BR-14) |
| Branch deleted | no branch to link | `deleted: true` |
| CI outcome | `status` | `conclusion` once `status` is `completed`, else `status` |
| Repository name | `path_with_namespace` | `full_name` |
| Branch URL | `/-/tree/<branch>` | `/tree/<branch>` |
| Enterprise host | self-managed GitLab | GitHub Enterprise Server |

The GitHub webhook also offers a legacy `X-Hub-Signature` (SHA-1). It is
ignored: accepting it would let a downgrade attack pick the weaker digest.

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
12. A GitHub delivery signed with the connection's secret verifies; the same
    body with one byte changed, a signature from a different secret, a missing
    header, and a SHA-1-only signature all give `401`.
13. A GitHub pull request that merges shows **Merged**, not Closed, and fires
    the on-merge transition (BR-14).
14. A GitHub `push` and a GitLab `Push Hook` naming the same issue produce the
    same links, distinguishable only by `provider` — a `deleted: true` push and
    a `ping` produce none.
15. Two connections in one organization, one GitLab and one GitHub, both link to
    the same issue and both appear on its panel.

## 8. Future Scope

Bitbucket and Azure DevOps (each one adapter file), smart-commit commands
(`#close`, `#time 2h`), posting back to the provider, backfilling history on
connect, "Create branch" from an issue, repository↔project links as first-class
metadata, CI status as its own concept, and OAuth/GitHub App connections instead
of a shared secret.
