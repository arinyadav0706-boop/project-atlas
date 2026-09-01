# ADR-0053 — Code integration (GitLab first, provider-agnostic)

- **Status:** Accepted
- **Date:** 2026-08-22 (amended 2026-08-27 — §9 adds GitHub)
- **Module:** `docs/02_Modules/34_code_integration.md`
- **Relates to:** ADR-0052 (public API and webhooks), ADR-0024 (permission
  engine), ADR-0049 (statuses), ADR-0050 (automations), ADR-0004 (portability)

## Context

Work lives in EAGLES; the code lives in GitLab. Today the only thing connecting
them is a person pasting a merge-request URL into a comment, which is exactly
the kind of manual bookkeeping a tracker is supposed to remove.

Jira, ClickUp and Asana all solve this the same way, and it is worth being
precise about what "the same way" means, because it is the whole feature: **you
put the issue key in a branch name, a commit message or a merge-request title,
and the tracker notices.** Jira calls the result a development panel; ClickUp
and Asana show a similar strip on the task. Nobody asks the user to link things
by hand, and nobody replaces the git host — Atlassian owns both Jira and
Bitbucket and still keeps them separate products that integrate.

The explicit requirement here is that GitLab must not be baked in. The company
may move to GitHub, or acquire a team that already has. So the question this ADR
answers is not "how do we read GitLab webhooks" — it is "what has to be true so
that adding GitHub later is a new file rather than a rewrite".

## Decision

### 1. A provider interface, and **verification lives inside it**

The obvious design is to share one webhook verifier and vary only the parsing.
That design is wrong, and GitLab and GitHub disagree at exactly the level that
proves it:

- **GitLab** sends the configured secret **verbatim** in `X-Gitlab-Token`. There
  is no HMAC. You compare it, in constant time, to what you stored.
- **GitHub** sends `X-Hub-Signature-256`, an HMAC-SHA256 of the raw body keyed
  by the secret. Comparing it to the stored secret would never match.

A shared verifier would have to be torn open for the second provider — which is
the precise failure "make it agnostic" is asking us to avoid. So `verify` is a
method on the provider, next to `parse`.

(Worth recording: GitLab's scheme is the weaker of the two. The secret travels
on every request, so anything that logs inbound headers logs the credential.
That is GitLab's choice, not ours; the mitigation is a per-connection secret
that can be rotated without touching anything else.)

### 2. Route by **issue key**, not by a repo-to-project mapping

`VWP-123` already names the project. So an event does not need to know which
EAGLES project a repository belongs to — it needs to find the keys in the text
and look them up.

This removes an entire class of configuration: no repo↔project table to set up,
to keep in step when a repo is renamed or moved, or to get wrong on the day
somebody adds the fourth service to a monorepo. One repository can feed twenty
projects and a project can be fed by twenty repositories, with nothing
configured for either.

### 3. Key detection matches the org's **real project keys**, never a generic pattern

The naive implementation is `/[A-Z]+-\d+/`. Run it over real commit messages and
it links `UTF-8`, `ISO-8601`, `SHA-256`, `RFC-9457`, `CVE-2026-1234` and half of
`AES-256-GCM`.

A tracker that invents links is worse than one that misses them: a wrong link on
an issue is noise a person has to investigate and then remove, and after the
second one they stop reading the panel. So candidates are extracted with a
pattern and then **filtered against the project keys that actually exist in that
organization**. Unknown keys are dropped silently.

### 4. One normalised `CodeEvent`, and nothing downstream knows the provider

The adapter's whole job is to turn a provider's payload into
`{ kind: "PUSH" | "MERGE_REQUEST" | "PIPELINE", repository, branch?, commits?,
mergeRequest? }`. The linking service, the panel, the auto-transition and every
future consumer see only that.

This is what makes the seam real rather than decorative: if the word "gitlab"
appears outside the adapter and the provider registry, the abstraction has
already leaked.

### 5. Links are **upserted**, keyed by provider + kind + external id

Webhooks retry, and providers re-deliver. A panel that lists the same merge
request four times because it was pushed to four times is a panel nobody trusts.
Every link is an upsert on a natural key, so replay is free — the same property
ADR-0052 §8 relies on for outbound delivery, applied inbound.

### 6. Auto-transition on merge is **opt-in and names its status**

"When the MR merges, move the issue to Done" is the single most requested
behaviour and the single most annoying default. Teams that review after merge,
or deploy before closing, will find their board wrong every day.

So it is off until switched on, and when it is on the target status is chosen
explicitly rather than inferred — a project may have three statuses in the DONE
category (ADR-0049). The move goes through `IssueService`, so transition rules,
the subtask-done guard and notifications all still apply.

### 7. **No outbound calls to the provider in V1** — ⚠️ SUPERSEDED by ADR-0054

> Reversed on 2026-08-27. The paragraph below said this would get its own
> decision when something genuinely needed it; backfill did, and ADR-0054 is
> that decision. Outbound reads now happen, authenticated by a provider app
> install rather than the stored token this section was worried about. The
> reasoning here is kept because it is still why we do not hold a PAT, and why
> posting *back* to the provider is still out.


Webhook payloads carry the branch, the commits, the merge request, its state and
its URL — everything the panel shows. Fetching more would mean storing an access
token that can read (and, with the wrong scope, write) the company's source
code.

That is a large security surface to take on for a nicer avatar, and it is the
thing a security review will ask about first. When something genuinely needs it —
posting a comment back onto an MR — it gets its own decision.

### 8. Connections are org-level and administered by an org ADMIN

A connection carries a webhook secret and, later, a token. A project lead
configuring one would be a lead of one project opening a channel into the whole
organization's data — the same reasoning as webhooks in ADR-0052 §12.

### 9. GitHub (added 2026-08-27), and what the seam actually cost

The claim in §1 was that a second provider would be a new file rather than a
rewrite. It was tested five days later. The honest accounting:

**What was a new file.** `lib/github.ts` — 1 adapter, `verify` + `parse`. Plus
one enum value, one line in the registry, and a provider picker in the admin
dialog. No change to the linking service, the repository, the endpoint, the
Development panel, the key parser, or any type outside the adapter. The seam
held.

**Where the two providers genuinely disagree**, all of it absorbed inside the
adapter:

| | GitLab | GitHub |
|---|---|---|
| Auth | secret verbatim in `X-Gitlab-Token` | HMAC-SHA256 of the raw body in `X-Hub-Signature-256` |
| Event name | `object_kind` **in the body** | `X-GitHub-Event` **header only** — the body says nothing |
| Merge request | `state: "merged"` | `state: "closed"` + `merged: true` |
| Branch deletion | ref present, no commits | `deleted: true`, `after` all zeroes |
| CI | `Pipeline Hook`, `status` | `check_suite`, `status` *and* `conclusion` |
| Repo path | `path_with_namespace` | `full_name` |
| Branch URL | `/-/tree/x` | `/tree/x` |

**The one that would have been a silent bug.** GitHub has no merged state. A
merged pull request arrives as `state: "closed"` with `merged: true`. An adapter
that read `state` alone would mark every merged PR **Closed** on the panel and
would never fire the on-merge transition in §6 — and it would look correct in
review, because `closed` is a real GitHub state that maps to a real link state.
It is only wrong for the one case anybody cares about. This is covered by a test
that asserts MERGED, not by a reviewer's attention.

**What the header-only event name cost.** The GitLab adapter prefers
`object_kind` from the body and falls back to the header, because a proxy may
drop the header. GitHub has no body equivalent, so `X-GitHub-Event` is
load-bearing: a proxy that strips it makes every delivery unparseable. That is
GitHub's design; the adapter answers 200 with "nothing to link" rather than
failing, which per BR-8 is right but is also indistinguishable from a hook that
is simply quiet. The `lastEventAt` field is what tells the difference.

**Still no outbound calls** (§7). This adds a second provider to receive from,
not the ability to call either one. Create-branch, backfill and posting back
remain out.

## Consequences

**Good.** The manual bookkeeping goes away, and the panel answers "is this
actually done" with evidence rather than a status somebody remembered to change.
No configuration to drift. Self-managed GitLab and GitHub Enterprise both work,
because the connection carries its own base URL. A company can run both hosts at
once — during a migration, or after an acquisition — and the panel shows links
from both on the same issue without knowing they came from different products.

**Costs.** One implementation does not prove an abstraction — see below. Nothing
appears until somebody types a key, so adoption depends on a habit. Without
outbound calls we cannot backfill history: a repository connected today shows
nothing that happened yesterday. No smart-commit commands (`#close`, `#time`).

**How proven is the seam — answered.** This paragraph originally said the
interface had one implementation and that calling it proven would be claiming
something untested. It now has two, and the prediction can be scored: it named
repository identity, pipeline/check semantics and pagination as the parts most
likely to move. Two of the three were right and both were absorbed inside the
adapter (`full_name` vs `path_with_namespace`; `check_suite`'s split of `status`
and `conclusion`). Pagination did not arise, because §7 still holds. The one it
missed entirely is the merge-request state mapping in §9 — the difference that
would actually have shipped a bug. Two implementations is not proof for a third,
but the interface absorbed a provider it was not written against without a
signature change, which is the strongest evidence available short of a third.

**Not decided here.** Smart-commit commands, posting back to the provider,
backfilling history, linking a repository to a project as first-class metadata,
CI status as a first-class concept beyond a link, per-repository access control,
and OAuth-based connections instead of a shared secret.
