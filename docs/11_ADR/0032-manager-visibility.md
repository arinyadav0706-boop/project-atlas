# ADR-0032: Manager visibility (a third authorization axis)

**Status:** Accepted
**Date:** 2026-07-30
**Deciders:** Founding CTO
**Relates to:** ADR-0031 (teams), ADR-0024 (permission engine), security F-1.
**Enables:** Workload view (Epic 3), team reports (Epic 4).

## Context

With teams (ADR-0031), a manager must see the work of **their reports across all
projects — even projects the manager isn't a member of**. Today authorization
has two axes: org role (ADMIN/MEMBER) and project role (LEAD/MEMBER/VIEWER).
Neither expresses "A manages A1, so A may see A1's assigned work." We need a
third, **management-relationship** axis — without breaking tenant isolation.

## Decision

Add a **management-visibility** relation, computed from the team hierarchy and
consumed as a *read* scope:

- `TeamService.getManagedUserIds(actor)` returns the set of user ids the actor
  manages: members of every team where `managerId = actor.userId`, **plus all
  descendant teams** (via `parentTeamId`). The actor's own id is included so
  "my team" views naturally contain the manager.
- **Computation:** load the org's teams (a bounded set — org-scoped, F-1) and
  walk `parentTeamId` in memory (BFS) from the actor's managed roots. O(teams);
  no recursion in SQL. If an org ever has thousands of teams, swap the in-memory
  walk for a `WITH RECURSIVE` CTE behind the *same* method signature — callers
  don't change.
- **Scope is read-only and report-scoped:** a manager may *view* their reports'
  assigned issues (title, project, status, effort) and aggregates — **not** edit
  them, and **not** the full project context of projects they're not a member of.
- **F-1 is intact:** `getManagedUserIds` only ever returns users in the actor's
  own org, so this never crosses tenants. Org ADMINs see everyone (existing
  elevation), so this axis matters for non-admin managers specifically.
- It lives in `TeamService` (the people axis owner); the permission engine gets
  a thin predicate `canViewUserWork(actor, targetUserId, managedIds)` for call
  sites. Every management read is auditable.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Give managers project VIEWER on every project | Wrong axis + explosion of membership rows; leaks whole projects, not just their reports' items. |
| Store a denormalized `managerId` on User | Loses team grouping + nesting; ADR-0031 already models it. |
| Recursive CTE now | Not needed at org scale; in-memory is simpler + trivially testable. Documented swap path keeps it future-proof. |

## Consequences

- **Positive:** managers see their whole team across projects; powers Workload +
  reports; tenant isolation preserved; one method is the single source of the
  visibility set.
- **Negative / trade-offs accepted:** in-memory hierarchy walk is bounded by org
  team count (fine now; CTE swap documented). Read-only in V2 — managers don't
  *edit* reports' work through this axis.
- **Follow-up:** Epic 3 Workload aggregates `WorkLog`/issues over
  `getManagedUserIds`; Epic 4 reports the same set.
