# Module: User Management

**Status:** Accepted v2.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-23

## Overview

User Management is the **identity & access platform service** for EAGLES: the
authoritative source of *who exists*, *what org role they hold*, and *whether
they may sign in*. It mounts into the Admin console (`13_admin.md`) as the
**Users** tab, gated by `AdminCapability.MANAGE_USERS` (ADR-0022), and is
consumed by every other module through shared seams rather than each module
re-implementing user logic.

It is designed as a core platform capability with a clear MVP / Foundation /
Future split, aligned with a Jira-scale identity model but without building
tables we don't need yet (CLAUDE.md rule #10).

| Tier | Capability |
|---|---|
| **MVP (now)** | List users (paginated, searchable, role/status filters), invite a user, change org role, deactivate/reactivate — all ADMIN-gated, audited, with the last-admin guard. |
| **Foundation (now)** | The `User` lifecycle model (invited→active→deactivated, soft-delete-safe), the centralized permission engine (ADR-0024) that resolves effective roles, and audit-action taxonomy for every user event — the extension points the Future items build on. |
| **Future** | Workspaces & teams, groups, custom roles, permission inheritance, bulk CSV invite, SSO auto-link, SCIM provisioning/deprovisioning. All additive — see Extensibility. |

## RBAC & authentication boundaries

- Every mutation requires `MANAGE_USERS` (ADR-0022), enforced server-side in the
  service layer (Coding Standards §7). In V1 that resolves to `orgRole = ADMIN`.
- **Org role vs. project role are separate axes** (`15_roles.md`). This module
  manages the **org** role (`ADMIN`/`MEMBER`). Project membership/roles are
  managed per-project (Project Settings → Members). Note: since **ADR-0024** an
  org `ADMIN` is an effective project `LEAD` everywhere — so promoting a user to
  `ADMIN` here grants them lead powers across all projects.
- **Deactivation is the auth boundary**: `isActive = false` blocks sign-in
  (`01_authentication.md` BR-4, already enforced in `auth-config`). This module
  flips the flag; auth reads it.

## Database

`User` (`docs/03_Database/01_Database_Design.md §2.2`) — no new tables for MVP.
Uses `orgRole`, `isActive`, `lastLoginAt`, `passwordHash` (null for invited-but-
never-signed-in), audit fields, and `deletedAt` (soft delete). Invited users are
real `User` rows created ahead of first sign-in so SSO/credentials match by
email instead of duplicating (BR-2).

## Business Rules

- BR-1: Only holders of `MANAGE_USERS` may invite, deactivate/reactivate, or
  change a user's `orgRole`.
- BR-2: Inviting creates a `User` (`isActive = true`, `passwordHash = null`)
  before first sign-in; the first successful login matches this row by email.
- BR-3: If `ALLOWED_EMAIL_DOMAINS` (ADR-0005) is set, inviting an out-of-domain
  email is rejected at invite time (fail fast).
- BR-4: Deactivating sets `isActive = false` — **never** a hard/soft delete of
  the `User` row (preserves issue attribution, comment authorship, audit).
- BR-5: The org must always keep **≥ 1 active ADMIN** — the service refuses to
  deactivate or demote the last active admin (mirrors "last LEAD", `03_projects.md`).
- BR-6: Deactivation leaves `ProjectMember` rows intact (reactivation restores
  access with history unchanged).
- BR-7: Every lifecycle action is audited (`USER_INVITED`, `USER_ROLE_CHANGED`,
  `USER_STATUS_CHANGED`, before/after) via the shared audit taxonomy.
- BR-8: Tenant scope (F-1): admins only ever see/modify users in their own org.
- BR-9: An admin cannot deactivate or demote **themselves** in a way that
  violates BR-5 (self-lockout guard is a special case of the last-admin rule).

## API (`docs/04_API/openapi.yaml`)

- `GET /admin/users` — paginated list (`page`/`pageSize`, `q`, `role`, `status`).
- `POST /admin/users` — invite (`email`, `name`, `orgRole`).
- `PATCH /admin/users/{userId}` — change `orgRole` and/or `isActive`.

All require `MANAGE_USERS`; non-holders get `403`; cross-org ids get `404`.

## UI

**Users** tab in the Admin console: a table (name/email/avatar, role badge,
Active/Deactivated, last login) with search + role/status filters; an **Invite
user** dialog; row actions (change role, deactivate/reactivate). Guarded actions
are hidden for the last admin per BR-5.

## Acceptance Criteria

- An ADMIN invites `x@allowed.com`; later that email signs in and matches the
  pre-created row (no duplicate).
- With `ALLOWED_EMAIL_DOMAINS=consint.ai`, inviting `x@other.com` fails
  immediately with a clear reason.
- Deactivating a user blocks their next sign-in; their issues/comments remain
  attributed; reactivating restores access with memberships intact.
- Attempting to deactivate or demote the **last active ADMIN** returns `409`.
- A non-admin calling any `/admin/users` endpoint gets `403`; the Users tab 404s.
- Every invite/role/status change appears in the Audit Log with before/after.

## Validation

- `InviteUserInput`: `email` (valid, domain-checked per BR-3), `name` (1–100),
  `orgRole` (enum, default `MEMBER`).
- `UpdateUserAdminInput`: `orgRole` and/or `isActive`, both optional (≥1 present).
- `UserListQuery`: `page`/`pageSize` (bounded), `q`, `role`, `status` optional.

## Extensibility points (how Future lands without schema redesign)

- **Workspaces / teams / groups**: new tables (`Workspace`, `Team`,
  `Group`, `GroupMember`) referencing `User` + `Organization`; membership
  resolution plugs into the permission engine's role resolution (ADR-0024) — no
  change to consuming modules.
- **Custom roles / permission inheritance**: the engine already centralizes
  "effective role"; custom roles become a `Role`/`Permission` table the engine
  reads, and inheritance is resolved there (one place).
- **Provisioning (SSO auto-link / SCIM)**: invite already pre-creates rows keyed
  by email; SCIM is an adapter that calls the same `UserService` lifecycle
  methods (create/deactivate), so provisioning reuses this module rather than
  duplicating it.
- **Consumed as a shared service**: other modules resolve users/roles via
  `UserService` + `PermissionService`, never by touching the `User` table — so
  identity logic lives here once.

## Future Scope

Workspaces, teams, groups, custom roles, permission inheritance, bulk CSV
invite, SSO auto-provisioning, SCIM deprovisioning, per-user session/device
management. Logged in the backlog.
