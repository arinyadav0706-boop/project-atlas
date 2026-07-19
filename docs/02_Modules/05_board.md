# Module: Board

**Status:** v2.0 (project-level + composable filters) · **Owner:** Founding CTO
· **Last Updated:** 2026-07-19 · **Decisions:** ADR-0009 (ordering), ADR-0008 (scope/filters)

## Overview

A Kanban view of a **project's** issues, grouped into the four fixed status
columns (`To Do / In Progress / In Review / Done`), with drag-and-drop
reordering and status transitions. The Board is a **project-level
visualization**; any scoping (Sprint, Epic, Assignee, Labels, …) is an optional
**filter** layered on top of the same board — not a separate board (ADR-0008).

## Business Rules

- **BR-1:** The Board shows the project's issues, grouped by `status` into the
  four columns, each ordered by `rank` (ADR-0009). With **no filter**, it
  shows all of the project's non-deleted issues.
- **BR-2:** Scoping is a **composable `BoardFilter`** applied server-side:
  `{ sprintId?, epicId?, assigneeId?, type?, priority?, labelIds?, search? }`.
  Filters combine (AND). Any subset may be empty. Adding a new filter later
  reuses this contract — no board redesign.
  - V1 activates the filters whose data exists today: **assignee, type,
    priority**. `sprintId`/`epicId`/`labelIds` are accepted by the contract and
    activate as those features ship (Sprint = Phase 5). **Saved Filters** (a
    stored, named `BoardFilter`) is a future item.
- **BR-3:** Dragging a card to a different column runs the **same workflow
  validation** as any status change (`04_issues.md` BR-5). An illegal move
  (e.g. `To Do → Done`) is rejected server-side; the card animates back to its
  origin column.
- **BR-4:** Reordering (within or across columns) updates `rank` via
  `PATCH /issues/{id}/rank`, computing a key **between the destination
  neighbours** (ADR-0009). Only the moved row is written.
- **BR-5:** `VIEWER` can see the Board; drag-and-drop is **disabled** for them
  (read-only, per `03_projects.md` / `15_roles.md`). Enforced server-side too.
- **BR-6:** Empty state — if the project has no issues (under the active
  filter), show an empty state inviting issue creation (Kanban-first); there is
  **no** "start a sprint" requirement.
- **BR-7 (filtered reorder):** When a filter is active, a reorder positions the
  card relative to its **visible** neighbours; a hidden card between them keeps
  its own rank (ADR-0008, accepted trade-off).

## Database

Reads `Issue` filtered by `projectId` + the `BoardFilter`, grouped by `status`,
ordered by `rank`. Writes `Issue.status` and `Issue.rank`. **No new
tables.** `rank` is a string fractional key (ADR-0009); index
`issues(projectId, status, rank)`. See `docs/03_Database/01_Database_Design.md`.

## API

- **`GET /api/projects/{projectId}/board`** — query params are the `BoardFilter`
  fields. Returns:
  ```
  BoardDto {
    columns: { status: IssueStatusDto; items: IssueListItemDto[] }[]  // 4, ordered
    counts: IssueStatusCounts                                          // per status + ALL
    appliedFilter: BoardFilter                                        // echoed
  }
  ```
  Each column is **bounded** (capped per column; per-column "load more" is a
  future enhancement — Performance doc). Reuses the existing `IssueListItemDto`.
- **`PATCH /api/issues/{issueId}/rank`** — body:
  ```
  { status?: IssueStatusDto; beforeId?: string | null; afterId?: string | null }
  ```
  Server: verify `beforeId`/`afterId` (if present) are issues in the **same
  project and destination status** (validated, not trusted from the client); if
  `status` differs from current, apply the transition (BR-3 workflow check);
  compute `rank` between the neighbours (`generateKeyBetween`, ADR-0009); write
  the one row. Returns the
  updated `IssueDetailDto`. RBAC: MEMBER/LEAD only (VIEWER → 403).
- Status-only moves may also use the existing `POST /issues/{id}/transition`;
  `rank` handles combined move + reorder in one call.

See `docs/04_API/openapi.yaml`.

## UI

Screen #6 in `docs/05_UI/02_Screens_and_Information_Architecture.md`. Four
columns; drag-and-drop via **dnd-kit**, animated (Design Principles §4 — fluid,
not a jump-cut). A filter-agnostic `<Board columns filter onFilterChange
canWrite />` component with a `<BoardFilterBar>` rendering the currently-available
filters. **Instant-feel:** an optimistic move updates the columns immediately and
calls `rank`; on server rejection (illegal transition / lost race) the card
animates back — no full-page refresh. Card click opens the issue detail.

## Acceptance Criteria

- Given a project with issues, when a user opens the Board, then they see those
  issues grouped into the four columns, each ordered by `rank`.
- Given a `BoardFilter` (e.g. `assigneeId`), when applied, then only matching
  issues show, counts reflect the filter, and the same component renders.
- Given a `VIEWER`, when they attempt to drag, then it is disabled/no-ops with a
  tooltip; a direct `rank` API call returns 403.
- Given a card dragged to an invalid transition target (BR-3), when dropped,
  then it animates back and no state changes.
- Given a card dropped between two cards, when persisted, then its `rank`
  is strictly between the neighbours and survives reload.

## Validation

`PATCH /issues/{id}/rank`: `beforeId`/`afterId` must reference non-deleted issues
in the **same project** and the **destination status** (or be null for column
ends) — validated server-side. `status` must be a legal transition from the
card's current status.

## Future Scope

- **Sprint filter** (Phase 5), **Epic filter**, **Label filter**, **Saved
  Filters** (stored named `BoardFilter`) — all reuse the `BoardFilter` contract
  and the same board component (ADR-0008).
- Per-column "load more" for very large columns.
- Swimlanes (by assignee/epic), WIP limits, configurable columns.
