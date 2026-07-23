# Module: Roles

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

The RBAC model itself: two fixed enums (`OrgRole`, `ProjectRole`), not a
dynamic/configurable role system in V1 (Security Architecture §2, A5).
This module doc defines the permission matrix that every other module's
"Business Rules" section assumes.

## Business Rules

- BR-1: Roles are enums, not database-configurable rows — adding a new
  role requires a schema migration and a documentation update here, by
  design (Security §2 A5: granularity confirmed as the V1 baseline when
  Phase 2 proceeded).
- BR-2: `OrgRole` and `ProjectRole` are independent axes — an org
  `MEMBER` can be a project `LEAD`. **⚠️ Superseded by ADR-0024
  (2026-07-23):** org `ADMIN` is now an **effective `LEAD` on every project**
  in its organization. The elevation lives in one place (the permission engine
  `elevate`, `src/features/authorization`); it is an *authorization* elevation
  scoped to the admin's own org (F-1 unchanged) and does not create membership
  rows. The original 2026-07-12 "no implicit project powers" rule is retained
  below only as history.
- BR-3: Every service method that mutates data checks the caller's
  relevant role before proceeding — this table is the enforcement
  reference, not aspirational documentation (Coding Standards §7).

## Permission Matrix

Project-scoped rows are governed by the caller's **effective** project role.
Since **ADR-0024**, an org `ADMIN` has an effective role of `LEAD` on every
project in its organization (elevation via the permission engine), so the
`ADMIN` column below reflects full project powers — within their own org only
(F-1). A non-admin's powers still come solely from their `ProjectMember` role.

| Action | `VIEWER` | `MEMBER` | `LEAD` | Org `ADMIN` (effective LEAD, ADR-0024) |
|---|---|---|---|---|
| View project/issues/board/backlog | ✅ | ✅ | ✅ | ✅ |
| Create/edit issue, comment, attachment | ❌ | ✅ | ✅ | ✅ |
| Delete own comment/attachment | ❌ | ✅ | ✅ | ✅ |
| Delete any comment/attachment (moderation) | ❌ | ❌ | ✅ | ✅ |
| Create/start/close sprint | ❌ | ❌ | ✅ | ✅ |
| Manage project members/roles | ❌ | ❌ | ✅ | ✅ |
| Edit project settings, archive/delete project | ❌ | ❌ | ✅ | ✅ |
| Invite/deactivate users, change org roles | ❌ | ❌ | ❌ | ✅ |
| View/edit org settings, audit log | ❌ | ❌ | ❌ | ✅ |

Guardrails (ADR-0024): elevation never crosses organizations (F-1), never
creates membership rows, and never counts toward a project's "at least one
LEAD" guard (that counts real `ProjectMember` LEAD rows only).

## Database

No dedicated table — `User.orgRole` and `ProjectMember.role` enums, per
`docs/03_Database/01_Database_Design.md §3`.

## API

No standalone `/roles` endpoint — role values are shared with the client
as generated TypeScript types from the Zod enums (single source of truth,
Coding Standards §3), and assignment happens via
`PATCH /admin/users/{userId}` (org role) and
`PATCH /projects/{projectId}/members/{memberId}` (project role) in
`docs/04_API/openapi.yaml`.

## UI

No standalone screen (per `docs/05_UI/02_Screens_and_Information_Architecture.md`
row 16) — role pickers are embedded in Project Settings → Members and
Admin → Users.

## Acceptance Criteria

- Given the permission matrix above, when any service method is called by
  a role marked ❌ for that action, then it returns `403`, verified by an
  automated test per role/action pair before a module is considered done
  (Coding Standards §8).
- Given an org `ADMIN` who is not a `ProjectMember` of a given project, when
  they attempt a project-scoped action requiring `LEAD`, then it **succeeds** —
  org `ADMIN` is an effective `LEAD` on every project in its org (ADR-0024).
  *(This reverses the 2026-07-12 rule; kept here as the current acceptance
  criterion.)*
- Given an org `ADMIN` of organization A, when they attempt any action on a
  project in organization B, then it returns `404`/`403` — elevation never
  crosses tenant boundaries (F-1, ADR-0024).

## Validation

Enum validation only (`OrgRole`, `ProjectRole`) — no free-text role input
anywhere in the system.

## Future Scope

- Custom/configurable roles beyond the two fixed enums.
- Granular per-field permissions (e.g., can edit priority but not
  reassign).
- Delegated admin scopes (e.g., a "billing admin" without full `ADMIN`).

**Extension point (ADR-0022):** org-level admin powers are now expressed as
`AdminCapability` values resolved by a single `resolveCapabilities(actor)`
function. In V1 every capability maps to `orgRole === "ADMIN"`. Custom roles
and delegated admin scopes land by extending *only* that resolver — no admin
service or route changes — which is why they're safe to defer.
