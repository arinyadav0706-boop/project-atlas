# Module: Notifications

**Status:** v2.0 (MVP implemented) · **Owner:** Founding CTO · **Last Updated:** 2026-07-23

## Overview

In-app notifications for the events a user cares about. V1 is in-app only
— no email digest/push (V2 scope). Delivery architecture: **ADR-0019**
(synchronous fan-out at the call site, precomputed per-recipient rows,
pull-based bell; a future outbox/bus seam behind `NotificationService`).

**MVP triggers built:** `ASSIGNED` (issue create/update + component
owner auto-assign), `COMMENT_ADDED`, `STATUS_CHANGED` → each fans out to the
issue's **assignee + reporter** (actor excluded, `notificationsEnabled`
honored). **Deferred (ADR-0019, backlog):** `MENTIONED` (needs comment
`@mention` parsing), commenter-participation recipients, real-time push,
email digest, per-type preferences, explicit watch/follow.

## Business Rules

- BR-1 (PRD FR-5.1 — scope decision): "watching" in V1 is **implicit
  participation**, not an explicit follow/subscribe toggle. A user is
  notified when: they're assigned an issue; they're `@mentioned` in a
  comment; an issue they're the assignee *or* reporter *or* have
  previously commented on changes status. There is no standalone
  "Watch" button in V1 — that's Future Scope, deliberately deferred rather
  than silently dropped (flagged here since the PRD's literal wording
  implies a broader "watching" concept than V1 ships).
- BR-2: A user with `notificationsEnabled = false` (their own profile
  setting, `16_profile.md`) generates no new `Notification` rows for
  themselves — checked at the point of creation, not filtered at read
  time.
- BR-3: Notifications are per-recipient rows; one triggering event (e.g. a
  status change) can fan out to multiple `Notification` rows (assignee +
  reporter + commenters), each independently readable/unreadable.
- BR-4: `message` is precomputed and stored at creation time (denormalized
  display text) so the notification list never needs to re-join source
  entities that may have since changed or been deleted.

## Database

`Notification` — `docs/03_Database/01_Database_Design.md §2.12`.

## API

`GET /notifications`, `POST /notifications/{notificationId}/read`,
`POST /notifications/read-all` — `docs/04_API/openapi.yaml`.

## UI

Top-bar bell icon with unread-count badge, dropdown list (screen #11 in
`docs/05_UI/02_Screens_and_Information_Architecture.md`), plus a full
`/notifications` page for history. Clicking a notification marks it read
and navigates to the source issue/comment.

## Acceptance Criteria

- Given a user is assigned an issue, when the assignment happens, then
  they receive one `ASSIGNED` notification (unless `notificationsEnabled
  = false`).
- Given a user has commented on an issue (but isn't assignee/reporter),
  when that issue's status changes, then they receive a
  `STATUS_CHANGED` notification (BR-1's implicit-participation rule).
- Given a user is `@mentioned` in a comment, when the comment is posted,
  then they receive a `MENTIONED` notification even if they've never
  interacted with that issue before.
- Given a user marks all notifications read, when they reload the bell
  dropdown, then the unread badge is cleared.

## Validation

No user-authored input beyond the read/unread toggle endpoints (no request
body — action is implied by the route).

## Future Scope

- Explicit follow/watch toggle independent of implicit participation (BR-1).
- Email digest and/or push notifications.
- Per-notification-type preferences (today: one global on/off toggle,
  `16_profile.md`).
