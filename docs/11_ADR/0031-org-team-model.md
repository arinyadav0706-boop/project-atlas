# ADR-0031: Org / Team model (people axis, matrix org)

**Status:** Accepted
**Date:** 2026-07-30
**Deciders:** Founding CTO
**Relates to:** V2 Epic 2 (`00_Product/05_V2_Management_Visibility_Layer.md` §1),
enables Workload (Epic 3) + team reports (Epic 4).

## Context

EAGLES models the **work axis** (who works on what) via `ProjectMember`, but has
no **people axis** (who reports to whom). Management questions ("what is *my
team* doing across all projects?") need an org structure that is **orthogonal to
projects**: a person belongs to one reporting team but works across many
projects (a matrix org). See the concrete case in the V2 doc: manager A owns
A1…A20; those people are spread across projects X/Y/Z.

## Decision

Introduce two models, independent of `ProjectMember`:

```
Team           { id, organizationId, name, managerId? (User), parentTeamId? (Team) }
TeamMembership { id, teamId, userId }   // unique(userId) — one team per user in V2
```

- **`managerId`** — the team's manager (the person who "sees" the team's work).
- **`parentTeamId`** — nesting, so a director's team is the parent of team-leads'
  teams; reporting rolls up the chain. **Cycles are rejected** in the service
  (a team can't become its own ancestor).
- **`TeamMembership`** is a join table with `unique(userId)` — V2 policy is
  one team per user, but the join shape means multi-team later is dropping the
  constraint, **not** a User-table migration. Scalable by construction.
- Teams are **org-scoped (F-1)** and **admin-managed** (a new `MANAGE_TEAMS`
  capability, ADR-0022 pattern). Soft-deleted with audit fields like every
  entity.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| `User.teamId` column | Couples people-structure onto the User row; multi-team later needs a table migration. A join table is the same query cost and future-proof. |
| Reuse `ProjectMember` for teams | Conflates the work axis with the people axis — the exact thing that makes cross-project management impossible. |
| Manager as a `User.managerId` chain (no Team entity) | No grouping object to name/manage/report on; teams are a first-class concept managers expect. |
| Closure table for hierarchy | Overkill at org scale (dozens–hundreds of teams); in-memory/recursive traversal over the bounded org set is simpler (see ADR-0032). |

## Consequences

- **Positive:** clean matrix org; manager visibility + workload become possible;
  nesting supports real org charts; membership shape scales to multi-team.
- **Negative / trade-offs accepted:** one-team-per-user in V2 (enforced by a
  unique index) — a deliberate simplification, relaxable without a rewrite.
- **Follow-up:** Workload (Epic 3) and team reports (Epic 4) consume
  `getManagedUserIds` (ADR-0032); multi-team membership when a customer needs it.
