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
  `MEMBER` can be a project `LEAD`, and an org `ADMIN` is not automatically
  a `LEAD` on every project (org admin ≠ implicit project ownership,
  keeping the two concerns separate).
- BR-3: Every service method that mutates data checks the caller's
  relevant role before proceeding — this table is the enforcement
  reference, not aspirational documentation (Coding Standards §7).

## Permission Matrix

Project-scoped rows are governed **solely by the caller's project role**
(founder-confirmed 2026-07-12, see BR-2 and Acceptance Criteria): an org
`ADMIN` gets no implicit project powers — on a project where they hold no
`ProjectMember` row, they have viewer-level visibility only (BR from
`03_projects.md` BR-7: all employees can view active projects).

| Action | `VIEWER` | `MEMBER` | `LEAD` | Org `ADMIN` (org-level only) |
|---|---|---|---|---|
| View project/issues/board/backlog | ✅ | ✅ | ✅ | ✅ (like any employee, per `03_projects.md` BR-7) |
| Create/edit issue, comment, attachment | ❌ | ✅ | ✅ | per their project role, if any |
| Delete own comment/attachment | ❌ | ✅ | ✅ | per their project role, if any |
| Delete any comment/attachment (moderation) | ❌ | ❌ | ✅ | per their project role, if any |
| Create/start/close sprint | ❌ | ❌ | ✅ | per their project role, if any |
| Manage project members/roles | ❌ | ❌ | ✅ | per their project role, if any |
| Edit project settings, archive/delete project | ❌ | ❌ | ✅ | per their project role, if any |
| Invite/deactivate users, change org roles | ❌ | ❌ | ❌ | ✅ |
| View/edit org settings, audit log | ❌ | ❌ | ❌ | ✅ |

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
- Given an org `ADMIN` who is not a `ProjectMember` of a given project,
  when they attempt a project-scoped action requiring `LEAD`, then org
  `ADMIN` status alone is **not** sufficient. **Founder-confirmed
  (2026-07-12):** `ADMIN` never implicitly acts as `LEAD`; org
  administration and project leadership are strictly separate powers
  (BR-2, and the Permission Matrix above reflects this).

## Validation

Enum validation only (`OrgRole`, `ProjectRole`) — no free-text role input
anywhere in the system.

## Future Scope

- Custom/configurable roles beyond the two fixed enums.
- Granular per-field permissions (e.g., can edit priority but not
  reassign).
- Delegated admin scopes (e.g., a "billing admin" without full `ADMIN`).
