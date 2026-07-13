# Module: Board

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

A Kanban view of a single sprint's issues, grouped into the four fixed
status columns, with drag-and-drop reordering and status transitions.

## Business Rules

- BR-1: The Board always shows exactly one sprint's issues — the project's
  current `ACTIVE` sprint by default, or an explicitly selected sprint via
  `?sprintId=`.
- BR-2: If a project has no `ACTIVE` sprint, the Board shows an empty
  state directing the user to the Backlog to start one — there is no
  "board with no sprint" view (that's what Backlog is for).
- BR-3: Dragging a card to a different column triggers the same
  `POST /issues/{id}/transition` validation as any other status change
  (`docs/02_Modules/04_issues.md BR-5`) — an invalid drop (were such a
  transition attempted) is rejected and the card animates back to its
  origin column rather than silently failing.
- BR-4: Reordering within or across columns updates `boardOrder` via
  `PATCH /issues/{id}/rank`, scoped to the destination column.
- BR-5: `VIEWER` project role can see the Board but drag-and-drop is
  disabled for them (read-only, per `03_projects.md` role model).

## Database

Reads `Issue` filtered by `sprintId` + groups by `status`; writes
`Issue.status`, `Issue.boardOrder` — no new tables. See
`docs/03_Database/01_Database_Design.md §2.7`.

## API

`GET /projects/{projectId}/board`, `PATCH /issues/{issueId}/rank`,
`POST /issues/{issueId}/transition` — `docs/04_API/openapi.yaml`.

## UI

Screen #6 in `docs/05_UI/02_Screens_and_Information_Architecture.md`. Four
columns (`To Do / In Progress / In Review / Done`), drag-and-drop animated
per Design Principles §4 (fluid reordering, not a jump-cut), card click
opens the issue detail panel without leaving the board.

## Acceptance Criteria

- Given a project with an `ACTIVE` sprint, when a user opens the Board,
  then they see that sprint's issues grouped into the four columns.
- Given a project with no `ACTIVE` sprint, when a user opens the Board,
  then they see the empty state pointing to Backlog, not an error or a
  blank board.
- Given a `VIEWER`, when they attempt to drag a card, then the drag is
  disabled/no-ops, with a tooltip explaining why.
- Given a card is dragged to a column that isn't a valid transition target
  (BR-3), when dropped, then it animates back and no state changes.

## Validation

`PATCH /issues/{id}/rank` input: `beforeIssueId`/`afterIssueId` must
reference issues in the same destination column (or both null for an
empty column) — validated server-side, not just inferred from client
drag state.

## Future Scope

- Swimlanes (by assignee or epic).
- WIP limits per column.
- Configurable columns (today: the one fixed workflow's four statuses).
