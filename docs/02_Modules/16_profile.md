# Module: Profile

**Status:** v2.0 (spec ratified) · **Owner:** Founding CTO · **Last Updated:** 2026-07-27
· **Decisions:** ADR-0027 (self-service account settings), ADR-0017 (storage
adapter), ADR-0024 (permission engine), ADR-0011 (OCC)

## Overview

**Profile** is a user's own account settings — the one place a person edits
*themselves*: display name, avatar, and their single in-app notification
toggle. It is deliberately the mirror image of **User Management**
(`14_user_management.md`): that module is an ADMIN editing *other* people's
org role and status; this module is a person editing only their own
presentation. The two never overlap — **nothing an ADMIN controls is editable
here, and nothing here is editable by an ADMIN on someone's behalf** (BR-3).

Everything the app shows about a person — assignee labels, comment authorship,
reporter, component lead — reads from the same `User` row, so a profile edit
propagates everywhere with **no denormalized copies to update** (AC-1).

## Business Rules

- **BR-1 (edit own identity):** a user edits their own `name` and `avatarUrl`.
  `email` is **read-only** — it's the key of the authenticated identity
  (changing it means re-linking a new IdP identity — Future Scope, ADR-0027).
- **BR-2 (notifications toggle):** `notificationsEnabled` (single boolean,
  `docs/03_Database/01_Database_Design.md §2.2`) gates **all** in-app
  notification creation for that user (`10_notifications.md` BR-2). Coarse by
  design in V1 — not a per-type matrix (`CLAUDE.md` rule 10; per-type is Future
  Scope).
- **BR-3 (no self-service privilege):** `orgRole`, `isActive`, and project-role
  memberships are **read-only** here. Changing them is exclusively an
  `ADMIN`/`LEAD` action in User Management / Project Settings, never
  self-service. The update endpoint **never accepts `orgRole` / `isActive` as
  input fields at all** (rejected by schema, not merely ignored — AC-3).
- **BR-4 (avatar via the storage seam):** an avatar is an image uploaded
  through the `StorageAdapter` (ADR-0017), the same seam as issue attachments —
  never an arbitrary URL string a client sets. Stored under a per-user opaque
  key; served by an **org-scoped** proxy route (`GET /users/{id}/avatar`), so a
  caller only ever sees avatars of people in their own tenant (F-1). Max 2 MB;
  `image/png`, `image/jpeg`, `image/webp`, `image/gif` only — validated
  server-side. Removing an avatar clears `avatarUrl` and best-effort deletes the
  blob (a storage failure never blocks the user).
- **BR-5 (own row only):** every read and write targets the **authenticated
  caller's own `User` row** (`/users/me`). There is no path here to read or
  write another user by id (that's User Management, capability-gated). Avatar
  *bytes* are the one cross-user read, and only within the org (BR-4).
- **BR-6 (OCC on save):** the identity save is optimistic-concurrency guarded by
  `version`-free semantics — a profile is single-owner (only you edit you), so a
  last-write-wins single-row update is sufficient; no cross-user race exists
  (contrast the multi-editor Board/Backlog, ADR-0011). Audit is **not** written
  for self-edits of name/avatar/notifications (low-value, high-volume; the org
  audit log is for administrative acts — `13_admin.md`).

## Database

Reads/writes the caller's own `User` row (`name`, `avatarUrl`,
`notificationsEnabled`; reads `email`, `orgRole`, `isActive`, memberships) —
**no new tables, no new fields** (ADR-0027). See
`docs/03_Database/01_Database_Design.md §2.2`. Avatar blobs live in the
`StorageAdapter`, keyed by an opaque per-user key; the `User.avatarUrl` string
holds the proxy route (with a cache-busting token), not the raw key.

## API

- **`GET /api/users/me`** — the caller's profile: editable fields + read-only
  `email`, `orgRole`, and a project-membership summary. Returns `ProfileDto`.
- **`PATCH /api/users/me`** — update `name?` and/or `notificationsEnabled?`.
  `UpdateProfileInput` only; extra/privileged fields are rejected (BR-3).
- **`POST /api/users/me/avatar`** — multipart image upload (BR-4); returns the
  new `avatarUrl`.
- **`DELETE /api/users/me/avatar`** — remove the avatar (BR-4).
- **`GET /api/users/{userId}/avatar`** — org-scoped proxy of the stored image
  bytes (BR-4/F-1); this is the URL rendered in `<img>` across the app.

See `docs/04_API/openapi.yaml`.

## UI

Screen #17 in `docs/05_UI/02_Screens_and_Information_Architecture.md`: reached
from the top-bar account menu ("Profile"). A single settings page:

- **Identity card** — avatar with upload / replace / remove, name field,
  read-only email. "Save changes" governs the **name only** and is disabled until
  it changes; inline validation.
- **Notifications card** — one "In-app notifications" switch that **saves itself
  on flip** (optimistic, reverted on failure) — it is not tied to the identity
  "Save changes" button, so its intent is unambiguous.
- **Access card (read-only)** — org role badge + a list of the user's project
  memberships and their role in each, each a deep link to that project. This is
  informational, mirroring what an ADMIN sees, so a user understands their own
  access without being able to change it (BR-3).

On save the client refreshes its session (`useSession().update()`) so the
top-bar name/avatar update immediately without a re-login (ADR-0027) — the rest
of the app already reads live from the `User` row.

## Acceptance Criteria

- **AC-1:** Given a user updates their display name, when saved, then it's
  reflected across the app (assignee labels, comment authorship, top bar) with
  no stale denormalized copies.
- **AC-2:** Given a user turns off in-app notifications, when any triggering
  event occurs afterward (assignment, mention, status change), then no new
  `Notification` row is created for them until they turn it back on
  (`10_notifications.md` BR-2).
- **AC-3:** Given a user attempts to change their own `orgRole`/`isActive` via a
  crafted request, when it's processed, then it's rejected — the endpoint's
  schema does not accept those fields at all.
- **AC-4:** Given a user uploads a 5 MB file or a non-image, when submitted,
  then it's rejected server-side with a clear message and the avatar is
  unchanged.
- **AC-5:** Given a user in org A, when they request the avatar of a user in org
  B, then it 404s (F-1) — avatars never cross the tenant boundary.

## Validation

`UpdateProfileInput`: `name` (1–100 chars, trimmed, optional),
`notificationsEnabled` (boolean, optional); **at least one** field present; no
other keys accepted (`.strict()`). Avatar upload: MIME in the image allow-list
and size ≤ 2 MB, enforced in the service (never trusting the client-declared
type — sniffed on serve). `email`, `orgRole`, `isActive` are not part of any
input schema in this module.

## Future Scope

- Granular per-notification-type preferences (email digest, per-event toggles).
- Timezone / locale (affects date rendering app-wide).
- Change email / manage linked SSO identities.
- Personal API tokens (tied to the V2 public API / webhooks scope).
- Avatar cropping / focal-point selection before upload.
