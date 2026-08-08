# ADR-0038: Mentions, participation, and comment threads

**Status:** **Accepted** — 2026-08-08.
**Date:** 2026-08-08
**Deciders:** Founders (Arin), acting CTO

Supersedes the "MVP renders flat" note in ADR-0016 §3.

## Context

Comments shipped complete on its own terms — post, edit with OCC, delete, keyset
pagination, XSS boundary, audit + notification seams. Three things it does not
do are the difference between "a comment box" and "a discussion tool":

1. **`NotificationType.MENTIONED` exists in the enum and is never written.** A
   dead branch in shipped code, and the single most-used comment feature in
   every tool we benchmark against.
2. **Only the assignee and reporter are notified.** Comment on an issue you
   don't own and you never hear about the reply — the thread is invisible to
   its own participants. This is the defect people actually feel.
3. **`parentCommentId` and its index exist; nothing renders them.** The
   threading backbone was built in ADR-0016 and left unused.

A 500-person org means a busy issue can accumulate hundreds of comments. The
issue page cannot be the only place they live.

## Decision

### 1. A mention is a structured token, not a name match

The body stores `@[Display Name](user:<id>)`. The composer inserts it; the
renderer turns it back into a chip.

The obvious alternative — store `@arin` and resolve names at render time — is
wrong in three ways that only show up later. Display names are **not unique**
in a 150-person org, they **change** (and every historical comment would
silently re-point or break), and they **contain spaces**, so `@Arin Yadav`
cannot be delimited from the prose that follows it without guessing.

Binding to the immutable id at write time means a mention keeps pointing at the
person it named, forever, even after a rename. Jira (`[~accountid:…]`) and
Slack (`<@U…>`) both landed here; the reasoning is the same.

`comment_mentions` is then a **derived index**, not the source of truth — the
body is. The table exists so "who was mentioned" and "notify them" are one
indexed read instead of a scan over comment text, and it is rebuilt from the
body on every edit.

### 2. No cap on mentions per comment

Explicitly decided against a limit. `@`-ing a whole team into a decision is a
legitimate and common use, and a cap is felt exactly when the tool matters
most. The fan-out is one batched `createMany`, mutations are already rate
limited to 120/min per user (ADR-0028), and `enabledRecipients` filters to
active users who accept notifications — so the cost is bounded by org size, not
by anything a single actor can inflate without hitting the limiter first.

What we do **not** do is silently drop the tail: every resolved mention either
produces a notification or is visibly not a mention.

### 3. Participants are notified, and a mention outranks a comment

Recipients of a new comment are the union of assignee, reporter, and
**everyone who has previously commented on that issue**. Participation is the
signal a person cares — it is what Jira, Linear and GitHub all use.

When a user is both mentioned and a participant they get **one** notification,
typed `MENTIONED`. Precedence rather than two rows: a mention is strictly more
urgent, and two notifications for one comment is the behaviour that makes
people turn notifications off.

### 4. Threads are one level deep, and overflow to their own page

Replies attach to a **top-level comment**. A reply to a reply re-parents to the
same root. Unbounded nesting produces the Reddit staircase, which is unreadable
in a side panel and unimplementable in a fixed-width issue view.

The issue page shows top-level comments, each with its **3 most recent
replies** and a `View all N replies` link. That link is a **page**, not an
in-place expansion:

    /projects/{projectId}/issues/{issueId}/comments/{commentId}

A long thread deserves its own URL — it is linkable, shareable, and
back-buttonable, and it keeps the issue page's cost constant no matter how
large a discussion grows. In-place expansion would make one popular thread
unbounded the page.

### 5. Reply previews are the newest 3, not the oldest

The list of top-level comments stays oldest-first, which is how a discussion
reads. Reply *previews* invert: the newest 3, because the useful question about
a thread you have already seen is "what happened since", and the answer to
"how did it start" is one click away on the thread page.

## Consequences

- A rename no longer rewrites history; the chip re-resolves from the id.
- `MENTIONED` stops being a dead enum value.
- One new table (`comment_mentions`), one new index on `notifications`
  (PERF-9 — its sort was never covered), one new index on `comments` for
  reply counts.
- Mention autocomplete needs a mentionable-users endpoint, scoped to people the
  actor can already see. It is not a user directory: it returns project members
  first, and never leaks a user outside the actor's organization.
- Deleting a comment soft-deletes its mentions with it, so a deleted comment
  stops appearing in "mentions me".

## What this does not do

Reactions, edit history, and comment attachments stay out — see the backlog.
Real-time push stays out: the bell polls, and the `NotificationService` seam is
where a transport would attach. Rich Markdown rendering is still deferred
(`bodyFormat` remains a promise the renderer does not yet keep) — mentions
render as chips, everything else stays escaped text. That is tracked separately;
shipping a sanitiser is its own security decision and does not belong in the
same change as a notification fan-out.
