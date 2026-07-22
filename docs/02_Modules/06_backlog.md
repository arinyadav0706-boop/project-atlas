# Module: Backlog

**Status:** v2.0 (spec ratified) · **Owner:** Founding CTO · **Last Updated:** 2026-07-20
· **Decisions:** ADR-0009 (rank), ADR-0011 (OCC), ADR-0013 (unified rank + scoped reorder)

## Overview

The **Backlog** is the ordered list of a project's **unscheduled** issues
(`sprintId = null`) — the groomable queue teams sequence and, once Sprint ships
(Phase 5), pull into a sprint. It is a **view over issues**, like the Board: same
entity, same `rank`, a different filter (ADR-0013). No new tables.

## Ordering model — one rank, many views (ADR-0013)

An issue has a **single `rank`** (ADR-0009). Every view orders by it under its own
filter: the **Board** groups by `status`, the **Backlog** filters `sprintId = null`,
a future **Sprint board** filters `sprintId = X`. Moving an issue is always the
same operation — place it between two visible neighbours and compute a key between
their ranks (`PATCH /issues/{id}/rank`, one-row write, OCC).

Because neighbours differ per view, reorder carries a **`scope`** telling the
server which set to validate the neighbours against:
- `board` (default) — neighbours must be in the same project **and destination
  status** (a drop can also change status).
- `backlog` — neighbours must be in the same project **and unscheduled**
  (`sprintId = null`); no status change.
New scopes (e.g. `sprint`) are added without touching existing callers.

## Business Rules

- **BR-1:** the Backlog lists non-deleted issues where `projectId = P` and
  `sprintId = null`, ordered by `rank` (ADR-0009), independent of status. Bounded
  by keyset pagination (like the issue list) — backlogs grow large.
- **BR-2:** new issues created without a sprint default to the Backlog
  (`sprintId = null`) and append to its end — already true (`createWithKey`). A
  Jira-style **inline "add issue"** input at the bottom of the backlog creates a
  `TASK` via the existing create endpoint (MEMBER/LEAD).
- **BR-3 (reorder):** `MEMBER`/`LEAD` reorder via `PATCH /issues/{id}/rank` with
  `scope = backlog`; neighbours validated as unscheduled (ADR-0013). Single-row
  write, optimistic-concurrency guarded (ADR-0011). `VIEWER` is read-only.
- **BR-4 (assign to sprint):** setting `sprintId` moves an issue out of the
  Backlog and into that sprint's scope. **Activates when the Sprint module ships
  (Phase 5)** — the Backlog is fully usable before then as a standalone ordered,
  groomable queue.
- **BR-5 (scope & privacy):** all reads are org- and membership-scoped (F-1);
  archived projects are read-only (no reorder).
- **BR-6 (return from sprint):** closing a sprint returns its incomplete issues
  to the Backlog (`sprintId = null`) — owned by the Sprint module (`07_sprint.md`
  BR-3); they simply reappear here, ordered by their existing rank.

## Database

Reads/writes `Issue` (`sprintId`, `rank`, `version`) — **no new tables**. Adds a
covering index **`issues(projectId, sprintId, rank)`** for the backlog query
(`WHERE projectId, sprintId IS NULL ORDER BY rank`); `rank` keeps `COLLATE "C"`
(ADR-0009). See `docs/03_Database/01_Database_Design.md`.

## API

- **`GET /api/projects/{projectId}/backlog`** — keyset-paginated list of
  unscheduled issues ordered by `rank`. Returns `IssueListItemDto[]` + `nextCursor`
  + `canWrite`. Reuses the shared issue card DTO.
- **`PATCH /api/issues/{issueId}/rank`** with `scope: "backlog"` — reorder within
  the backlog (ADR-0013). Shared endpoint with the Board.
- **`PATCH /api/issues/{issueId}`** (`sprintId`) — assign to a sprint (activates
  with Sprint, Phase 5).

See `docs/04_API/openapi.yaml`.

## UI

Screen #7 in `docs/05_UI/02_Screens_and_Information_Architecture.md`: a single
ordered list, drag-to-reorder via **dnd-kit** (same motion as the Board),
optimistic move + animate-back on server rejection (illegal/lost-race), OCC. A
**Backlog** tab in the project nav. When Sprint ships, a "Sprint" section header
appears above the list so dragging an issue into it assigns `sprintId` in one
motion (BR-4). `VIEWER` sees a read-only list.

## Acceptance Criteria

- Given unscheduled issues, when a user opens the Backlog, then they see them
  ordered by `rank`; issues assigned to a sprint do **not** appear.
- Given a user drags to reorder, then `rank` reflects the new order, persists
  across reload, and only the moved row is written.
- Given two users reorder the same issue concurrently, then the stale one is
  rejected (`409`) rather than silently overwritten (ADR-0011).
- Given a `VIEWER`, when they attempt to reorder, then it is disabled; a direct
  API call returns `403`.
- Given a reorder with `scope=backlog`, when a neighbour is not unscheduled
  (`sprintId != null`), then it is rejected server-side.

## Validation

`PATCH /issues/{id}/rank` (`scope=backlog`): `beforeId`/`afterId` must reference
non-deleted, unscheduled issues in the same project (or null for list ends),
validated server-side; `expectedVersion` required (OCC).

## Future Scope

- **Assign to sprint** via drag (Sprint, Phase 5) — the "Sprint" section header.
- Epic grouping / swimlanes; story-point sum per (future) sprint capacity.
- Bulk multi-select move/assign; saved backlog filters (label/assignee/epic).
- Per-column/section "load more" as backlogs get very large (keyset already in place).
