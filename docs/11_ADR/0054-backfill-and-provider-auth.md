# ADR-0054 — Backfill, and authenticating to the git host

- **Status:** Accepted
- **Date:** 2026-08-27
- **Module:** `docs/02_Modules/35_code_backfill.md`
- **Supersedes:** ADR-0053 §7 ("no outbound calls to the provider in V1")
- **Relates to:** ADR-0053 (code integration), ADR-0052 (public API and
  webhooks), ADR-0051 (the scheduler), ADR-0011 (optimistic concurrency),
  ADR-0004 (portability), ADR-0024 (permission engine)

## Context

ADR-0053 shipped code integration one direction only: a git host posts to us,
we link what it names. It works, and it has one flaw that everybody notices in
the first hour — **connect a repository today and yesterday does not exist.**
Every issue that already had a branch, a commit or a merge request shows an
empty Development panel until somebody happens to push again.

Jira, ClickUp and Asana all backfill on connect. Jira's DVCS connector walks the
repository's history and shows a per-repository sync status; ClickUp imports on
connect; Asana pulls the linked pull requests. It is not an advanced feature,
it is the difference between an integration that looks broken and one that looks
finished.

ADR-0053 §7 refused outbound calls, and said so in terms that anticipated this
document: *"When something genuinely needs it — posting a comment back onto an
MR — it gets its own decision."* This is that decision. It is being taken
deliberately, not drifted into.

**What changes about our risk.** Until now EAGLES held one secret per connection
whose only power was to prove that an inbound POST came from the git host. It
could not read anything. From here EAGLES holds a credential that can **read the
company's source code**. That is a different category of asset, and the rest of
this ADR is mostly about not being careless with it.

## Decision

### 1. Authenticate with a **provider app install**, not a stored personal token

The cheap option is a field on the connection where an admin pastes a personal
access token. It is one form field, it works on every provider and every
self-hosted install, and it was the recommendation this ADR was originally
drafted around.

It was rejected, and the reasons are worth writing down because they are the
whole shape of this ADR:

- A PAT carries **the person's** access, not the integration's. When they leave
  the company, or their access is narrowed, the integration breaks or — worse —
  keeps the access they no longer have.
- It is **long-lived and unscoped in practice**. GitHub fine-grained PATs help;
  GitLab personal tokens with `read_api` still read every project the human can.
- **Revocation is not where anybody looks.** Removing an app install is a thing
  a security team can find and audit. A token pasted into another product's
  settings page two years ago is not.
- It is what Jira's original DVCS connector did, and what Atlassian spent years
  migrating away from. Copying the version they abandoned is not "industry
  standard", it is industry history.

So: **GitHub App** for GitHub, **OAuth application** for GitLab. Short-lived
tokens, install-scoped, revocable from the git host's own UI.

The cost is real and is being accepted knowingly: this cannot be self-served.
Somebody with admin rights on the GitHub organisation and on the GitLab instance
has to register an application before any of it works. §9 says what that means
for what has actually been proven.

### 2. The credential is an **interface**, exactly like the webhook adapter

ADR-0053 §1 made verification a method on the provider because GitLab and GitHub
disagree about it. The same is true, more so, of getting an access token:

| | GitHub App | GitLab OAuth app |
|---|---|---|
| Identity | an **app**, installed on an org | an **application**, authorised by a user |
| First step | install → `installation_id` | authorization code + PKCE |
| Access token | minted from a JWT signed with the app's private key | exchanged, then refreshed |
| Lifetime | 1 hour, re-minted on demand | 2 hours, refresh token **rotates on use** |
| Long-lived secret we hold | the app private key (deployment-wide) | a refresh token (per connection) |
| Scope | the repositories selected at install | the user's `read_api` reach |

Nothing above can be papered over with a shared "get a token" function. So
`CredentialProvider` has `authorizeUrl`, `exchange` and `freshAccessToken`, and
the backfill code never learns which provider it is talking to.

Note the last two rows especially: **GitLab's refresh token rotates on every
use**, so a lost write means a dead connection. That is why the refresh path
persists the new token before the old one is used for anything.

### 3. Tokens are **encrypted at rest**, with a key that is not in the database

A refresh token in a plaintext column means a database dump is a source-code
credential. AES-256-GCM, key from `CREDENTIAL_ENCRYPTION_KEY`, ciphertext
carries its own version prefix so the key can be rotated without a migration.

This deliberately does not use the storage adapter or any host-specific KMS:
ADR-0004 says stay portable, and a managed KMS is the fastest way to bolt this
release to one cloud. The trade is that key custody is now an operational
responsibility — recorded as a go-live item, not hidden.

GCM rather than CBC because the tag detects tampering. A silently-altered
ciphertext that decrypts to garbage would be sent to the git host as a bearer
token, which is a worse failure than an error.

### 4. Repositories become **rows**, and this is *not* a repo→project mapping

Backfill cannot walk "all of GitLab". It needs a list of repositories, so
`code_repositories` exists.

This is the closest this design has come to the thing ADR-0053 §2 refused, so
the distinction has to be exact: **a repository row is a work list, not a
mapping.** It says "scan this repo". It does not say which EAGLES project the
repo belongs to, and nothing reads it during linking. Routing is still by issue
key, one repo can still feed twenty projects, and deleting every repository row
would stop backfill without changing a single webhook link.

If a future change adds `projectId` to that table, this ADR has been broken.

### 5. Backfill produces links through **the same code path as webhooks**

The tempting shape is a second writer: fetch history, write `code_links`. It is
also how the two paths drift, and then a backfilled merge request looks subtly
different from a webhooked one — different title truncation, different author,
a state that never updates.

So the API clients normalise into the **same `CodeEvent` union** the adapters
produce, and backfill feeds them to the **same `linkEvent`**. A backfilled link
and a webhook link are the same row written by the same function; replaying a
webhook over a backfilled link just updates it (ADR-0053 §5).

One consequence worth stating: backfill therefore honours BR-2 exactly. A commit
is linked only if **its own message** names the key, even when the branch it sits
on matches.

### 6. Backfill is a **claimable, resumable job** on the existing scheduler

No queue infrastructure is being introduced. `code_backfill_runs` is a row; the
scheduler tick (ADR-0051 §5) drains it; a conditional update claims it so two
overlapping ticks share work rather than duplicating it — the same trick as
recurrences and webhook retries.

Each run persists a **phase and a cursor**, so a tick that runs out of budget
stops cleanly and the next one continues from where it stopped. This matters
more here than anywhere else in the system: a 40-minute walk of a large
repository cannot be a single request, and must not restart from zero because a
container was recycled.

**"Run now" also drains a slice synchronously.** Not a duplicate mechanism — the
same function, called from a request instead of the tick. It exists because
GL-10 says the cron is not configured in production, and a feature that silently
does nothing until somebody wires up a scheduler is a feature that will be
reported as broken.

### 7. Bounded by default: **90 days**, and the admin can change it

Unbounded is not an option a monorepo survives; 500k commits is hours of API
calls and a rate-limit ban. 90 days covers the work anybody still cares about
and matches how Jira bounds its own sync.

It is a setting rather than a constant because "90 days" is wrong for somebody:
a quiet repo wants two years, a busy one wants two weeks.

### 8. Rate limits are **obeyed, not survived**

Both providers publish remaining quota on every response and `Retry-After` when
they cut you off. A backfill that ignores them gets the whole installation
throttled, which breaks the webhook path too — the feature would damage the
feature it was added to complete.

So: stop when remaining quota is low, honour `Retry-After` exactly, exponential
backoff on 5xx, and leave the cursor where it is. A paused backfill that resumes
in an hour is a correct outcome and the UI says so rather than showing a failure.

### 9. **What is proven, and what is not** — read this before trusting it

Registering a GitHub App and a GitLab OAuth application requires admin rights on
the company's GitHub organisation and GitLab instance. Those registrations do not
exist yet, so the following is **implemented and tested against a local fake
provider that speaks both protocols over real HTTP** — real authorization
redirects, real code exchange, real token refresh including GitLab's rotation,
real pagination, real rate-limit headers — and has **never been run against
github.com or a real GitLab**:

- the install and callback flow,
- token exchange and refresh,
- repository listing, and the walk over merge requests, branches and commits.

A fake provider proves the logic and the failure handling. It cannot prove that
a real provider's payload matches the shape assumed, that a scope is sufficient,
or that a redirect URI is accepted. Those are one afternoon with real
credentials, and until that afternoon happens this module is **not** to be
described as working. The first real install will find something; the point of
the fake is that it will be one thing and not thirty.

## Consequences

**Good.** The empty-panel-on-connect problem goes away, which is the gap between
this integration and the three products it is measured against. The credential
is revocable from the git host, scoped to selected repositories, and short-lived.
Backfilled links are indistinguishable from webhook links because they are
written by the same function. Nothing new to operate: the existing scheduler
drains it.

**Costs.** EAGLES now holds a credential that can read source code — the
security review's first question, and correctly so. Setup is no longer
self-service: somebody with org admin has to register an application per
provider before anyone can connect anything. A deployment-wide GitHub App
private key is a single high-value secret with real custody requirements. And
§9: the whole path is unproven against a real provider.

**Not decided here.** Posting back to the provider (comments, statuses),
"Create branch" from an issue, smart-commit commands, Bitbucket and Azure
DevOps, per-repository access control, and re-syncing on a schedule rather than
on demand.
