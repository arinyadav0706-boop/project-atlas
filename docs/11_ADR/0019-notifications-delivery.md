# ADR-0019 — Notifications: Synchronous Fan-out with a Future Event Seam

- Status: Accepted
- Date: 2026-07-23
- Deciders: Founding team

## Context

In-app notifications must appear when a user is assigned an issue, when their
issue's status changes, or when someone comments on it (10_notifications.md,
BR-1). The `Notification` table already exists (per-recipient rows, precomputed
`message`, `isRead`/`readAt`). The question is *how* rows get created and
delivered without over-building for MVP.

## Decision

**Generate notifications synchronously at the call site.** The service that
performs the triggering write (assign, transition, comment) calls
`NotificationService.notify(...)` right after its own successful write, in the
same request. One `NotificationService` owns all fan-out and creation; trigger
services never touch the `notifications` table directly.

- **Per-recipient rows, precomputed message** (BR-3/BR-4): one event fans out
  to N rows; the display string is stored so the list never re-joins source
  data that may have changed.
- **Recipient rule (MVP):** the issue's **assignee + reporter** (and the newly
  assigned user for ASSIGNED). The actor themselves is always excluded — you
  never notify yourself. Recipients with `notificationsEnabled = false` are
  skipped at creation (BR-2), not filtered at read time.
- **Best-effort, non-blocking:** a notification failure must never fail the
  user's actual action (the assign/comment still succeeds). Fan-out is wrapped
  so it can't surface as a request error.
- **Delivery is pull-based (polling)** for MVP: the bell fetches unread count +
  a recent page. No websockets.

## MVP scope vs. deferred

**In:** `ASSIGNED` (create/update/component-auto-assign), `COMMENT_ADDED`,
`STATUS_CHANGED`.

**Deferred (logged, rule #13):**
- `MENTIONED` — needs `@mention` parsing in comment bodies (comments store
  escaped plain text today; ADR-0016 deferred mentions to this module's landing).
- **Commenter participation** — notifying past commenters on status/comment
  events (BR-1) needs a distinct-authors query + cross-feature coupling; MVP
  covers assignee + reporter, which is the 90% case.
- **Real-time push, email digest, per-type preferences, explicit watch/follow.**

## The future seam

Because trigger services depend only on `NotificationService.notify(...)`,
moving to an **outbox + async worker** (for real-time websockets and email)
later is an internal change to that one service — a new transport behind the
same call, no change to the trigger sites. This is the extensibility line: we
build the synchronous path now, and keep the single choke point that a bus can
slot behind.

## Consequences

- Simple, debuggable, correct for a 500-user internal tool; no queue infra.
- A burst event (e.g. status change with many participants later) does a small
  bounded `createMany` in-request — fine at this scale; the outbox seam is the
  escape hatch if that ever changes.
