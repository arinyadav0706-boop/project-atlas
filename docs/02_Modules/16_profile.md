# Module: Profile

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

A user's own account settings: display name, avatar, and the single
global notification toggle (per-type preferences are Future Scope).

## Business Rules

- BR-1: A user can edit their own `name` and `avatarUrl`; `email` is not
  editable here — it's tied to the authenticated identity (changing it
  would require re-linking a new IdP identity, out of scope for a simple
  profile edit).
- BR-2: `notificationsEnabled` (single boolean, `docs/03_Database/01_Database_Design.md §2.2`)
  gates all in-app notification creation for that user
  (`10_notifications.md` BR-2) — this is deliberately coarse in V1, not a
  per-notification-type matrix, per the "no premature abstraction"
  principle (`CLAUDE.md` rule 10).
- BR-3: `orgRole` and project role memberships are read-only on this
  screen — changing them is exclusively an `ADMIN`/`LEAD` action in their
  respective modules, never self-service.

## Database

`User` — `docs/03_Database/01_Database_Design.md §2.2`.

## API

`GET/PATCH /users/me` — `docs/04_API/openapi.yaml`.

## UI

Screen #17 in `docs/05_UI/02_Screens_and_Information_Architecture.md`: a
simple form — avatar upload/preview, name field, a single
"In-app notifications" toggle, and a read-only summary of org role +
project memberships.

## Acceptance Criteria

- Given a user updates their display name, when saved, then it's reflected
  immediately across the app (issue assignee labels, comment authorship,
  etc. — read from the same `User` row, no denormalized copies to update).
- Given a user turns off in-app notifications, when any triggering event
  occurs afterward (assignment, mention, status change), then no new
  `Notification` row is created for them until they turn it back on.
- Given a user attempts to change their own `orgRole` via a crafted
  request, when the request is processed, then it's rejected — this
  endpoint never accepts `orgRole` as an input field at all (not merely
  filtered).

## Validation

`UpdateProfileInput`: `name` (1–100 chars, optional),
`notificationsEnabled` (boolean, optional), `avatarUrl` (optional, set via
the attachment/upload flow rather than an arbitrary URL string — same
`StorageAdapter` path as issue attachments).

## Future Scope

- Granular per-notification-type preferences.
- Timezone/locale settings (affects date displays across the app).
- Personal API tokens (tied to the V2 public API / webhooks scope).
