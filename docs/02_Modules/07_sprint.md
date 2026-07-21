# Module: Sprint

**Status:** v2.0 (MVP spec ratified) · **Owner:** Founding CTO · **Last Updated:** 2026-07-20
· **Decisions:** ADR-0009 (rank), ADR-0011 (OCC), ADR-0013 (unified rank + scoped reorder), ADR-0014 (sprint assignment + backlog-page section)

## Overview

A **Sprint** is a time-boxed set of a project's issues, cycling
`PLANNED → ACTIVE → COMPLETED`. Sprints are the second half of Scrum planning: the
Backlog (ADR-0013) is the groomable queue of unscheduled issues (`sprintId = null`);
a sprint holds the issues committed for one cycle (`sprintId = X`). Both are views
over the same `Issue` entity ordered by the shared `rank` — **no new tables**.

The sprint is **not a separate screen**: it appears as a droppable section above the
Backlog list on the Backlog page (ADR-0014), carrying its lifecycle controls, goal,
and progress. Dragging an issue between the section and the Backlog moves it in/out
of the sprint.

## Scope (v2.2)

**Multi-sprint planning** (ADR-0015): the Backlog page shows every non-completed
sprint (ACTIVE + all PLANNED) as its own droppable section; drag issues into any of
them. Plus: Create · Start · Complete · **Edit** name/goal/dates · **Delete**
(guarded) · **View completed sprints** (history) · dates + overdue on each sprint ·
goal (free text) · basic progress (done vs. total, story points). Still **deferred**
(see Future Scope): sprint-*queue* reordering (drag to reorder the planned sprints
themselves), follow-up-sprint at close, burndown/velocity.

## Business Rules

- **BR-1 (one active per project, PRD FR-4.1):** at most one `ACTIVE` sprint per
  project. Starting a sprint is a transactional check → `409` if another is already
  active.
- **BR-2 (start prerequisites, FR-4.2):** starting (`PLANNED → ACTIVE`) requires
  `name`, `startDate`, and `endDate`, with `endDate > startDate` (cross-field check
  in the service, not just per-field Zod).
- **BR-3 (complete, FR-4.3):** completing (`ACTIVE → COMPLETED`) returns every issue
  not in `DONE` status to the Backlog (`sprintId = null`), keeping its existing
  `rank`. (MVP always returns to the Backlog; a follow-up-sprint target is deferred.)
- **BR-4 (RBAC):** only `LEAD` can create, edit, start, or complete a sprint, and
  only `MEMBER`/`LEAD` can move issues in/out of a sprint. `VIEWER` and non-members
  get a read-only view (they still *see* the sprint — projects are org-visible).
- **BR-5 (immutability):** a `COMPLETED` sprint is frozen — no issue may be moved
  into or out of it. Its issue set at completion is the historical record for the
  future velocity report (`11_reports.md`).
- **BR-6 (assignment, ADR-0014):** moving an issue between Backlog and a sprint (or
  repositioning it within a sprint) is one atomic `sprintId` + `rank` write, guarded
  by optimistic concurrency (ADR-0011); the target sprint must be in the same
  project and not `COMPLETED`. Neighbours are validated server-side, never trusted.
- **BR-7 (progress is derived, ADR-0014):** a sprint's progress is computed at read
  time (`GROUP BY status` over its issues) — no stored counters.
- **BR-8 (edit):** a `LEAD` may edit a non-completed sprint's name/goal/dates
  (`endDate > startDate`); a `COMPLETED` sprint is read-only (BR-5).
- **BR-9 (delete):** a `LEAD` may soft-delete a `PLANNED` or `COMPLETED` sprint; an
  `ACTIVE` sprint must be completed first. A deleted sprint's issues return to the
  backlog (keeping their rank) — never stranded.
- **BR-10 (history):** `COMPLETED` sprints are listed on the Backlog page (name,
  dates, final progress), most-recently-ended first, so they don't vanish.

## Database

Reads/writes `Sprint` (existing) and `Issue` (`sprintId`, `rank`, `version`) —
**no new tables, no schema change**. The sprint issue list query
(`WHERE projectId, sprintId = X ORDER BY rank`) is covered by the existing
`issues(projectId, sprintId, rank)` index (ADR-0013); `Sprint` has
`@@index([projectId, status])` for the active/planned lookup. See
`docs/03_Database/01_Database_Design.md`.

## API

- **`GET /api/projects/{projectId}/sprints`** — sprints for a project, each with
  derived progress (`SprintWithProgressDto`).
- **`POST /api/projects/{projectId}/sprints`** — create a `PLANNED` sprint (LEAD).
- **`PATCH /api/sprints/{sprintId}`** — edit `name`/`goal`/`startDate`/`endDate` (LEAD, BR-8).
- **`DELETE /api/sprints/{sprintId}`** — soft-delete a PLANNED/COMPLETED sprint (LEAD, BR-9).
- **`POST /api/sprints/{sprintId}/start`** — `PLANNED → ACTIVE` (BR-1, BR-2; LEAD).
- **`POST /api/sprints/{sprintId}/complete`** — `ACTIVE → COMPLETED`, incomplete
  issues → Backlog (BR-3; LEAD).
- **`PATCH /api/issues/{issueId}/sprint`** — move an issue to a sprint or back to the
  Backlog, positioned between neighbours (ADR-0014, BR-6). Body:
  `{ sprintId: string | null, beforeId, afterId, expectedVersion }`.

See `docs/04_API/openapi.yaml`.

## UI

Backlog page (`/projects/{id}/backlog`) gains a **Sprint section** above the Backlog
list (ADR-0014):
- Shows the project's current sprint — the `ACTIVE` one, else the next `PLANNED`.
  If none, a "Create sprint" affordance (LEAD).
- Header: name, goal, dates, a basic **progress bar** (done/total), and the
  lifecycle button — **Start** on a `PLANNED` sprint (opens a modal for the required
  dates, BR-2), **Complete** on an `ACTIVE` one (modal showing the incomplete count
  that will return to the Backlog, BR-3). An irreversible-feeling action gets an
  explicit modal step, not a silent toast+Undo.
- Drag issues between the Sprint section and the Backlog (dnd-kit, same motion as the
  Board/Backlog): optimistic move + animate-back on server rejection (illegal / lost
  race / `COMPLETED`), OCC. `VIEWER` sees a read-only view.

## Acceptance Criteria

- Given a project with an `ACTIVE` sprint, when a user starts another, then the API
  returns `409` and the UI explains only one sprint can be active (BR-1).
- Given a `PLANNED` sprint without dates, when a user starts it, then it is rejected
  until `startDate`/`endDate` are set with `endDate > startDate` (BR-2).
- Given a sprint with 3 incomplete issues at completion, when the user completes it,
  then all 3 return to the Backlog with `sprintId = null` and their ranks intact (BR-3).
- Given a `COMPLETED` sprint, when any client moves an issue into or out of it, then
  the request is rejected (BR-5).
- Given a `MEMBER` drags an issue from the Backlog into the sprint, then `sprintId`
  is set and its rank places it between its dropped neighbours, in one write (BR-6).
- Given a `VIEWER`, when they attempt any sprint action or drag, then it is disabled;
  a direct API call returns `403`.
- Given a sprint with 5 issues (2 DONE), when it is read, then progress shows 2/5 (BR-7).

## Validation

`CreateSprintInput`: `name` (1–100, required), `goal` (≤2000, optional).
`UpdateSprintInput`: `name`/`goal`/`startDate`/`endDate` optional; `endDate >
startDate` enforced in the service. `MoveIssueToSprintInput`: `sprintId` (string or
null), `beforeId`/`afterId` (nullable), `expectedVersion` (required, OCC).

## Future Scope

- **Follow-up sprint at completion** (`moveIncompleteIssuesToSprintId`) instead of
  always returning to the Backlog.
- **Multi-sprint planning** — several `PLANNED` sprints visible/orderable at once.
- **Reports** — velocity (completed story points per closed sprint) and burndown,
  consuming the `COMPLETED` record (`11_reports.md`).
- Sprint templates / recurring cadence; sprint-level goals as a checklist.
