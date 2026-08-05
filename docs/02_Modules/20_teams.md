# Module 20 — Teams & Hierarchy

**Status:** v1.0 (V2 Epic 2) · **ADRs:** 0031 (org/team model), 0032 (manager
visibility) · **Enables:** Workload (Epic 3), team reports (Epic 4).

## Overview
The **people axis** — teams, managers, and reporting lines — orthogonal to
project membership (the work axis). A person belongs to one team (V2) but works
across many projects; a manager sees their team's work across *all* projects.
Inspired by Asana (Teams) + Jira. Admin-managed; managers get a read-only
"My Team" view.

## Business Rules
- **BR-1** A `Team` has a name, an optional **manager** (a User), and an optional
  **parent team** (nesting). Org-scoped (F-1). Soft-deleted.
- **BR-2** Teams and membership are managed by holders of the **`MANAGE_TEAMS`**
  capability (org ADMIN in V1; ADR-0022). Managers do **not** self-manage teams.
- **BR-3** A user belongs to **at most one team** (V2 — unique on `userId`).
  Adding them to a second team moves them (or is rejected — see Validation).
- **BR-4** `parentTeamId` must not create a **cycle** (a team can't be its own
  ancestor); the manager/parent must be in the same org.
- **BR-5** **Manager visibility** (ADR-0032): a manager sees the users in every
  team they manage **plus all descendant teams**. Read-only, report-scoped,
  org-bound. Exposed as `getManagedUserIds(actor)` for Workload/reports.
- **BR-6** Deleting a team soft-deletes it and detaches its memberships;
  children are re-parented to the deleted team's parent (no orphan islands).
- **BR-7** All writes are audited (`TEAM_CREATED/UPDATED/DELETED`,
  `TEAM_MEMBER_ADDED/REMOVED`).

## Database (ADR-0031, DB design §2.19)
- `Team { id, organizationId, name, managerId?, parentTeamId?, +audit, deletedAt }`
- `TeamMembership { id, teamId, userId, +audit }` — `unique(userId)`.

## API
- `GET  /api/admin/teams` — teams with manager + member counts (MANAGE_TEAMS).
- `POST /api/admin/teams` — create.
- `GET/PATCH/DELETE /api/admin/teams/{teamId}` — detail / rename+manager+parent /
  soft-delete.
- `POST /api/admin/teams/{teamId}/members` — add a user (moves if already teamed).
- `DELETE /api/admin/teams/{teamId}/members/{userId}` — remove.
- `GET /api/teams/my` — the caller's reports (managed users), for "My Team".

## UI
- **Admin console → Teams**: list teams (name, manager, #members, parent);
  create/edit (name, manager select, parent select); manage members (add/remove).
- **My Team** (sidebar, shown when the caller manages ≥1 team): read-only list of
  reports (name, email, their team). Workload metrics arrive in Epic 3.

## Acceptance Criteria
- Admin creates a team, assigns a manager + parent, adds members → appears with
  counts. Non-admin → 403. Cross-org manager/parent/member → rejected.
- Setting a parent that would cycle → 422. Adding an already-teamed user → moves
  them (single-team invariant holds).
- A manager's `GET /teams/my` returns their team's members + descendants'
  members; a non-manager gets an empty set (org admins excepted).
- Deleting a team re-parents its children and detaches members; audit recorded.

## Validation
- `name`: 1…80, trimmed. `managerId`/`parentTeamId`: cuid or null, same org.
  `userId` (membership): cuid, same org. Parent cycle rejected server-side.

## Future Scope
Multi-team membership (drop the unique), team-scoped project defaults, capacity
per team (hours/week) feeding Workload, delegated `MANAGE_TEAMS` to managers.
