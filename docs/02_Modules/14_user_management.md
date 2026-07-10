# Module: User Management

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

Inviting, deactivating, and role-assigning users at the organization
level. Restricted to `orgRole = ADMIN` (BRD BR-3).

## Business Rules

- BR-1: Only `ADMIN` can invite a user, deactivate a user, or change a
  user's `orgRole`.
- BR-2: Inviting a user creates a `User` row (`isActive = true`,
  `passwordHash = null`) before they've ever signed in — their first
  successful SSO login (or credentials setup, if using the fallback)
  matches against this pre-created row by email rather than creating a
  duplicate.
- BR-3: If ADR-0005's `ALLOWED_EMAIL_DOMAINS` is set, inviting a user with
  an email outside the allow-list is rejected at invite time (fail fast,
  don't wait until their first login attempt to discover the mismatch).
- BR-4: Deactivating a user sets `isActive = false` — never a hard delete
  or soft delete of the `User` row itself (BRD BR-2: preserves issue
  attribution, comment authorship, audit history).
- BR-5: The system must always have at least one active `ADMIN` — the
  service layer rejects deactivating or demoting the last `ADMIN`,
  mirroring the "last project LEAD" rule in `03_projects.md` BR-3.
- BR-6: Deactivating a user does not remove their `ProjectMember` rows —
  it blocks their login (`01_authentication.md` BR-4), leaving
  membership/history intact in case they're reactivated later.

## Database

`User` — `docs/03_Database/01_Database_Design.md §2.2`.

## API

`GET/POST /admin/users`, `PATCH /admin/users/{userId}` —
`docs/04_API/openapi.yaml`.

## UI

Screen #15 in `docs/05_UI/02_Screens_and_Information_Architecture.md`: a
user table (shadcn/ui `table`) with role badge, active/inactive status,
last login, and row actions (change role, deactivate/reactivate); an
"Invite User" modal (email, name, initial org role).

## Acceptance Criteria

- Given an `ADMIN` invites a new user by email, when that email later
  signs in via Google/Microsoft, then it matches the pre-created `User`
  row rather than creating a duplicate account.
- Given `ALLOWED_EMAIL_DOMAINS=consit.ai` is set, when an `ADMIN` invites
  `someone@other.com`, then the invite is rejected immediately with a
  clear reason.
- Given exactly one `ADMIN` exists, when someone attempts to deactivate or
  demote them, then the request is rejected with `409`.
- Given a deactivated user, when reactivated, then their prior project
  memberships and issue history are unchanged (nothing was deleted).

## Validation

`InviteUserInput`: `email` (valid format, domain-checked per BR-3 when
applicable), `name` (1–100 chars), `orgRole` (enum, defaults `MEMBER`).
`UpdateUserAdminInput`: `orgRole`/`isActive`, both optional.

## Future Scope

- Bulk invite via CSV upload.
- SCIM-based auto-provisioning/deprovisioning from Microsoft Entra ID.
- Custom onboarding flows (welcome email, guided first project).
