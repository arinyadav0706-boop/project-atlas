# ADR-0015: Multi-Sprint Planning on the Backlog Page

**Status:** Accepted
**Date:** 2026-07-21
**Deciders:** Founding CTO; founder direction (full Jira parity per module)

## Context

ADR-0014 put the sprint on the Backlog page as a single section showing the
project's *current* sprint (the `ACTIVE` one, else the next `PLANNED`). That is
enough to run one sprint, but Jira's backlog lets a team **plan several sprints
ahead at once** — an active sprint plus a queue of planned sprints — dragging
issues into whichever they intend. The single-section model can't express that.

The underlying machinery already generalises: an issue's membership move
(`PATCH /issues/{id}/sprint`, ADR-0014) accepts *any* target `sprintId`, ordering
is the shared `rank` (ADR-0013), and the "one `ACTIVE` per project" rule (BR-1)
is independent of how many `PLANNED` sprints exist. So this is a presentation +
DTO change, not a data-model change.

## Decision

**The Backlog page shows every non-completed sprint (the `ACTIVE` one, if any,
then all `PLANNED` sprints) as its own droppable section, stacked above the
backlog list — all inside one DndContext.** Issues drag between any sprint and
the backlog (and between sprints). "Create sprint" always appends a new `PLANNED`
sprint, so a team can line up as many as they want.

This supersedes ADR-0014's *single-current-sprint* consequence; everything else
in ADR-0014 stands (dedicated move endpoint, derived progress, `COMPLETED`
immutability, sprint-as-backlog-section).

The panel contract changes from one sprint to a list:

```
SprintPanelDto {
  sprints: { sprint: SprintWithProgress; items: IssueListItem[] }[]  // ACTIVE first, then PLANNED (createdAt asc)
  completedSprints: SprintWithProgress[]
  canWrite, canManage
}
```

**Ordering of sprints** is `ACTIVE` first, then `PLANNED` by `createdAt` — no
sprint-level rank column in this iteration (reordering the *sprint queue* itself
is future scope; issues within each sprint already order by `rank`).

## Alternatives Considered

| Option | Rejected because |
|---|---|
| **Keep one current sprint; add a separate "sprints" screen** | Splits planning across two places; the whole point is dragging backlog→sprint in one view. Contradicts ADR-0014's single-view rationale. |
| **A sprint picker (dropdown) showing one sprint at a time** | Less capable than Jira; you can't see/curate multiple sprints at a glance or drag directly between them. |
| **Add a `rank` column to `Sprint` for a reorderable sprint queue now** | Premature — ordering by `createdAt` is enough to plan ahead; sprint-queue reordering is a real but separate feature (logged), and adding a column now is speculative (rule #10). |

## Consequences

- **Positive:** true Jira-style backlog planning — active + a queue of planned
  sprints, drag issues into any of them; no schema change; reuses the move
  endpoint, rank, progress, and one-active rule unchanged.
- **Negative / trade-offs accepted:** the planning view now manages N droppable
  lists + the backlog in one DndContext (more client state — a per-sprint item
  map); the sprint *queue* isn't drag-reorderable yet (ordered by creation).
- **Follow-up actions:**
  1. Panel DTO → `sprints[]`; repo `listPlanning`; service composes sections.
  2. Planning view renders N sprint sections + backlog in one DndContext.
  3. Sprint-queue reordering (drag to reorder the planned sprints themselves) —
     future scope, needs a sprint-level order key.
