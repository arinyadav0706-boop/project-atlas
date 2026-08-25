# ADR-0053 — Code integration (GitLab first, provider-agnostic)

- **Status:** Accepted
- **Date:** 2026-08-22
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

### 7. **No outbound calls to the provider in V1**

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

## Consequences

**Good.** The manual bookkeeping goes away, and the panel answers "is this
actually done" with evidence rather than a status somebody remembered to change.
No configuration to drift. Self-managed GitLab works, because the connection
carries its own base URL. Adding GitHub is one adapter plus one enum value.

**Costs.** One implementation does not prove an abstraction — see below. Nothing
appears until somebody types a key, so adoption depends on a habit. Without
outbound calls we cannot backfill history: a repository connected today shows
nothing that happened yesterday. No smart-commit commands (`#close`, `#time`).

**How proven is the seam, honestly.** The interface was shaped by two providers'
documented behaviour, not one, and the verification split above is a real
difference it already accommodates. But it has exactly one implementation, and
the parts most likely to move when GitHub lands are: the repository identity
shape (GitLab has numeric ids and a namespaced path; GitHub has `owner/repo`),
pipeline/check-run semantics, which differ more than merge requests do, and
pagination if outbound calls are ever added. Those are extensions, not rewrites —
but claiming the seam is proven would be claiming something untested.

**Not decided here.** Smart-commit commands, posting back to the provider,
backfilling history, linking a repository to a project as first-class metadata,
CI status as a first-class concept beyond a link, per-repository access control,
and OAuth-based connections instead of a shared secret.
