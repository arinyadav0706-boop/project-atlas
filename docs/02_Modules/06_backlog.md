# Module: Backlog

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

The ordered list of issues not yet scheduled into a sprint
(`Issue.sprintId = null`), ready to be groomed and pulled into a sprint.

## Business Rules

- BR-1: Backlog issues are ordered by `boardOrder` within the project
  (independent ordering space from any sprint's board columns).
- BR-2: Assigning an issue to a sprint (`sprintId` set) removes it from the
  Backlog view and it now appears on that sprint's Board once the sprint
  is `ACTIVE`.
- BR-3: Only `MEMBER`/`LEAD` project roles can reorder or assign issues to
  a sprint from the Backlog; `VIEWER` is read-only, same as Board.
- BR-4: New issues created without an explicit sprint default into the
  Backlog (`sprintId = null`) at the bottom of the ordering.

## Database

Reads/writes `Issue` (`sprintId`, `boardOrder`) — no new tables. See
`docs/03_Database/01_Database_Design.md §2.7`.

## API

`GET /projects/{projectId}/backlog`, `PATCH /issues/{issueId}/rank`,
`PATCH /issues/{issueId}` (to set `sprintId`) — `docs/04_API/openapi.yaml`.

## UI

Screen #7 in `docs/05_UI/02_Screens_and_Information_Architecture.md`: a
single ordered list, drag-to-reorder (same motion treatment as Board),
with a persistent "Sprint" section header above it once a `PLANNED` sprint
exists, so dragging an issue into that section assigns `sprintId` in one
motion.

## Acceptance Criteria

- Given three unscheduled issues, when a user reorders them via drag, then
  `boardOrder` reflects the new order and persists across reload.
- Given an issue is dragged into the Sprint section, when dropped, then
  its `sprintId` is set and it disappears from the Backlog list.
- Given a `VIEWER`, when they attempt to reorder or reassign, then the
  action is disabled.

## Validation

Same `PATCH /issues/{id}/rank` contract as Board (`05_board.md`
Validation), scoped to the backlog ordering space (`sprintId = null`)
instead of a board column.

## Future Scope

- Saved backlog filters (by label, assignee, epic).
- Bulk multi-select edit/move.
- Dedicated story-point estimation ("planning poker") mode.
