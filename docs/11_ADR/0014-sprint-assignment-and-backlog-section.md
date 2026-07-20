# ADR-0014: Sprint Assignment as a Move Operation; Sprint as a Backlog-Page Section

**Status:** Accepted
**Date:** 2026-07-20
**Deciders:** Founding CTO; founder direction (Jira-grade Scrum, MVP-focused)

## Context

The Backlog (ADR-0013) orders a project's *unscheduled* issues (`sprintId = null`)
by the shared `rank`. The **Sprint** module adds the other half of Scrum planning:
a time-boxed set of issues (`sprintId = X`) cycling `PLANNED → ACTIVE → COMPLETED`.
The MVP is deliberately scoped to: create a sprint, drag issues between the Backlog
and the sprint, start it, complete it (incomplete issues return to the Backlog),
edit its goal, and show basic progress.

Two design questions fall out of that:

1. **How does an issue change sprint membership?** Backlog reorder (`PATCH
   /issues/{id}/rank`, `scope=backlog`) is explicitly forbidden from changing
   `sprintId` (ADR-0013). Dragging an issue from the Backlog *into* a sprint both
   changes membership (`sprintId`) **and** positions it (a `rank` between the
   destination's neighbours). These must be one atomic, OCC-guarded write, or a
   crash between them leaves an issue in a sprint with a stale rank.

2. **Where does the sprint UI live, and is progress stored?**

## Decision

**1. A dedicated move endpoint: `PATCH /issues/{issueId}/sprint`.**
Body `{ sprintId: string | null, beforeId, afterId, expectedVersion }`. It sets
`sprintId` (a sprint, or `null` to return to the Backlog) **and** computes a
`rank` between the destination list's neighbours, in **one** row write guarded by
optimistic concurrency (ADR-0011). This is the single operation behind every
Backlog↔Sprint drag, sprint→backlog drag, and reposition within a sprint.

Responsibilities stay cleanly split:
- **`/rank`** (ADR-0013) — reposition *within one list*; membership unchanged.
- **`/sprint`** — *change membership* (and position in the destination).

**2. The sprint is a section on the Backlog page, not a separate screen.**
The Backlog page shows the project's current sprint (the `ACTIVE` one, else the
next `PLANNED` one) as a droppable panel above the Backlog list, carrying the
lifecycle controls (Create / Start / Complete) and goal. This matches the IA doc
(no standalone sprint screen) and ADR-0013's "Sprint section header".

**3. Progress is derived, never stored.** A sprint's progress (done vs. total
issues, and story points) is a `GROUP BY status` over its issues at read time —
no counter columns to drift. The `COMPLETED` sprint's issue set is already the
immutable historical record (BR-5) for the future velocity report.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| **Add `scope=sprint` to `/rank` and change `sprintId` there** | Overloads the reorder endpoint with a membership change it was defined *not* to do (ADR-0013); blurs "reposition" and "reassign". A drag into a sprint is a different intent than reordering a column. |
| **Assign via the generic `PATCH /issues/{id}` (sprint field)** | Sets the scalar but does no positioning, so a dragged issue lands with a stale rank; needs a second write → not atomic, OCC-unsafe. Fine for a non-drag "assign" later, not for the planning board. |
| **Store progress counters on `Sprint`** | Every issue add/remove/transition must update the counter transactionally; drifts under concurrency; `GROUP BY` over a sprint's bounded issue set is cheap and always correct. |
| **A standalone Sprint screen** | More navigation for a two-list drag that is inherently one view; contradicts the IA. Revisit only if multi-sprint planning (V2) needs it. |

## Consequences

- **Positive:** one atomic, OCC-safe operation per membership change; `/rank` and
  `/sprint` each have a single clear purpose; progress can't drift; the Sprint
  module adds **no schema change** (reuses `sprintId`, `rank`, `version`, and the
  existing `Sprint` table + `issues(projectId, sprintId, rank)` index).
- **Negative / trade-offs accepted:** repositioning *within* a sprint goes through
  `/sprint` (with `sprintId` unchanged) rather than `/rank` — a mild asymmetry with
  the Backlog (which uses `/rank`), chosen so the client rule is simply "a drop
  touching the sprint section → `/sprint`; a drop within the Backlog → `/rank`".
- **Deferred (logged in the tech-debt ledger):**
  - Follow-up-sprint target at close (`moveIncompleteIssuesToSprintId`) — MVP
    always returns incomplete issues to the Backlog.
  - Multi-sprint planning (several `PLANNED` sprints visible at once).
  - Velocity/burndown reports (Reports module) consume the `COMPLETED` record.
- **Follow-up actions:**
  1. `PATCH /issues/{issueId}/sprint` move endpoint (service + route + OCC).
  2. Sprint feature (create/list/update/start/close, derived progress), LEAD-gated.
  3. Backlog page grows a sprint section with drag between it and the Backlog.
  4. `COMPLETED` sprints reject moves in/out (BR-5); one `ACTIVE` per project (BR-1).
