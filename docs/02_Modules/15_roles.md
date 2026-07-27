# Module: Roles

**Status:** v2.0 (ratified) · **Owner:** Founding CTO · **Last Updated:** 2026-07-27
· **Decisions:** ADR-0024 (permission engine + org-admin elevation), ADR-0022
(capability-gated admin), ADR-0018 (labels/components governance)

## Overview

The RBAC model itself: two fixed enums (`OrgRole` = `ADMIN`/`MEMBER`,
`ProjectRole` = `LEAD`/`MEMBER`/`VIEWER`), not a dynamic/configurable role system
in V1 (Security Architecture §2, A5). This module is the **single reference** for
the permission matrix every other module's "Business Rules" section assumes, and
the map of **where each rule is enforced in code**. There is no standalone Roles
feature, screen, or endpoint — roles are enforced in the service layer and
assigned through the modules that own them.

## Business Rules

- **BR-1 (roles are enums, not data):** adding a role requires a schema migration
  and an update here — by design (Security §2 A5). No free-text role input exists
  anywhere (Validation, below).
- **BR-2 (two axes; org ADMIN is effective LEAD everywhere — ADR-0024):**
  `OrgRole` and `ProjectRole` are independent (an org `MEMBER` can be a project
  `LEAD`). Since **ADR-0024**, an org `ADMIN` is an **effective `LEAD` on every
  project in its own organization**. The elevation lives in exactly one place —
  `elevate()` in the permission engine (`src/features/authorization/permission.ts`)
  — is an *authorization* decision applied to the **caller's** role, never a
  membership *fact*, and never crosses tenants (F-1).
  *History: the original 2026-07-12 rule ("admins hold no implicit project
  powers") was reversed by ADR-0024 on 2026-07-23.*
- **BR-3 (enforced in the service layer, always):** every service method that
  mutates data resolves the caller's **effective** role and gates on it before
  proceeding — this is the enforcement reference, not aspirational documentation
  (Coding Standards §7). Client-side role checks are UX only, never a boundary.

## Permission Matrix

Project-scoped rows are governed by the caller's **effective** project role
(`elevate(actor, membershipRole)`): an org `ADMIN` resolves to `LEAD` on every
project in its org, so the `ADMIN` column reflects full project powers — within
its own org only (F-1). A non-admin's powers come solely from its `ProjectMember`
role.

| Action | `VIEWER` | `MEMBER` | `LEAD` | Org `ADMIN` (effective LEAD) |
|---|---|---|---|---|
| View project / issues / board / backlog / reports | ✅ | ✅ | ✅ | ✅ |
| Create / edit issue, comment, attachment | ❌ | ✅ | ✅ | ✅ |
| Move on board / backlog / into sprint | ❌ | ✅ | ✅ | ✅ |
| Attach labels / components to an issue | ❌ | ✅ | ✅ | ✅ |
| Delete **own** comment / attachment | ❌ | ✅ | ✅ | ✅ |
| Delete **any** comment / attachment (moderation) | ❌ | ❌ | ✅ | ✅ |
| Create / start / complete / delete sprint | ❌ | ❌ | ✅ | ✅ |
| Create / edit / delete **components** | ❌ | ❌ | ✅ | ✅ |
| Manage project members / roles | ❌ | ❌ | ✅ | ✅ |
| Edit project settings, archive / delete project | ❌ | ❌ | ✅ | ✅ |
| Create a **label** | ❌ | ✅ | ✅ | ✅ |
| Rename / delete a **label** (curator) | ❌ | ❌ | ✅¹ | ✅ |
| Invite / deactivate users, change org roles | ❌ | ❌ | ❌ | ✅ |
| View / edit org settings, feature flags, audit log | ❌ | ❌ | ❌ | ✅ |
| Edit **own** profile (name, avatar, notifications) | ✅² | ✅² | ✅² | ✅² |

¹ **Labels are org-level** (ADR-0018), so their curator right is
"org `ADMIN` **or** a `LEAD` of *any* project", not a single project's LEAD — see
`canManageLabels`. Known MVP limitation (a member can self-grant LEAD via a
throwaway project) accepted and tracked as **FUT-16**; the clean fix is a
one-line switch to ADMIN-only. F-1 is unaffected — this is governance, not a leak.

² **Profile is self-service** (module 16, ADR-0027): every role edits only its
*own* row; role/membership are read-only there. This is not a project/org power,
so it sits outside the role columns.

**Guardrails (ADR-0024):** elevation never crosses organizations (F-1), never
creates `ProjectMember` rows, and never counts toward a project's "at least one
LEAD" guard (which counts real `ProjectMember` LEAD rows only). The org's "at
least one active ADMIN" guard likewise counts real `User` rows.

## Enforcement map

The matrix above is realized by these shared primitives — the audit trail for
"BR-3 is real":

| Rule | Primitive | Where |
|---|---|---|
| Org-admin elevation (single source) | `elevate(actor, role)` | `authorization/permission.ts`; async seam `PermissionService.getEffectiveProjectRole` |
| Write content (MEMBER/LEAD) | `canWriteContent(elevate(…))` | issues, board, backlog, comments, attachments (create), components/labels (attach) services |
| Manage project (LEAD only) | `canManageProject(elevate(…))` | projects (settings/members), sprints (lifecycle), components (CRUD) services |
| Delete own vs. any | `… === author/uploader ‖ role === "LEAD"` | `comment.service.delete`, `attachment.service.delete` |
| ≥1 real LEAD per project | `ProjectRepository.countLeads` | `project.service` updateMemberRole / removeMember |
| Manage labels (curator) | `canManageLabels(actor, isLeadAnywhere)` | `label.service` update / delete |
| Admin powers → capabilities | `requireCapability(actor, cap)` over `resolveCapabilities` | user-management, organization, feature-flag, audit-log services |
| ≥1 active ADMIN per org | `UserManagementRepository.countOtherActiveAdmins` | `user-management.service.update` |
| Self-service profile | `.strict()` schema with no privileged keys | `profile.schemas.ts` / `profile.service` |
| Tenant isolation (F-1) | org-scoped resolve before every action | every feature service |

## Database

No dedicated table — `User.orgRole` and `ProjectMember.role` enums, per
`docs/03_Database/01_Database_Design.md §3`.

## API

No standalone `/roles` endpoint — role values reach the client as TypeScript
types generated from the Zod enums (single source, Coding Standards §3).
Assignment happens via `PATCH /admin/users/{userId}` (org role) and
`PATCH /projects/{projectId}/members/{memberId}` (project role); org-level admin
powers resolve through `AdminCapability` (ADR-0022). See
`docs/04_API/openapi.yaml`.

## UI

No standalone screen (`docs/05_UI/02_Screens_and_Information_Architecture.md`
row 16). Role pickers are embedded in **Project Settings → Members** and
**Admin → Users**; a user sees their own roles read-only on **Profile**
(module 16).

## Acceptance Criteria

- Given any service method called by a role marked ❌ for that action, then it
  returns `403` — covered by the engine unit tests (`permission.test.ts`), the
  cross-service RBAC tests (`issue.rbac.test.ts` and the `Forbidden` assertions
  in each feature's service + integration tests), and the admin-elevation
  integration test (`permission.integration.test.ts`). Keeping this coverage
  complete as new modules land is tracked as **TEST-3**.
- Given an org `ADMIN` who is **not** a member of a project in its org, when it
  attempts a `LEAD`-only action, then it **succeeds** (effective LEAD, ADR-0024)
  — proven in `permission.integration.test.ts`.
- Given an org `ADMIN` of org A acting on a project in org B, then it returns
  `404`/`403` — elevation never crosses tenants (F-1), proven in the same test.
- Given a project with a single real `LEAD`, when that LEAD is demoted/removed,
  then it is rejected (a project must keep ≥1 real LEAD) — an elevated admin does
  not satisfy the guard.

## Validation

Enum validation only (`OrgRole`, `ProjectRole`) — no free-text role input
anywhere in the system.

## Future Scope

- Custom / configurable roles beyond the two fixed enums (**FUT-25**).
- Granular per-field permissions (e.g., edit priority but not reassign).
- Delegated admin scopes — a "billing admin" / "audit viewer" without full
  `ADMIN` (**FUT-21**).
- Tighter label-management RBAC / centralized governance (**FUT-16**).
- Lone-lead leadership handoff without first adding a second lead (**RBAC-2**).

**Extension point (ADR-0022 / ADR-0024):** org-level admin powers resolve through
a single `resolveCapabilities(actor)`, and every project decision flows through a
single `elevate(actor, role)`. Custom roles, delegated scopes, and team/group
membership (FUT-24/25) all land by extending *only* those two functions — no
consuming service or route changes — which is why they are safe to defer.
