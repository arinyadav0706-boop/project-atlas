# Module: Sprint

**Status:** Draft v1.0 · **Owner:** Founding CTO · **Last Updated:** 2026-07-10

## Overview

A time-boxed scope of work for a project, cycling through
`PLANNED → ACTIVE → COMPLETED`. Board and Backlog are views keyed off a
sprint's lifecycle state.

## Business Rules

- BR-1 (PRD FR-4.1): only one `ACTIVE` sprint per project at a time —
  enforced with a transactional check when starting a sprint (`409` if
  another is already active).
- BR-2 (PRD FR-4.2): starting a sprint (`PLANNED → ACTIVE`) requires
  `name`, `startDate`, and `endDate` to already be set; `endDate` must be
  after `startDate`.
- BR-3 (PRD FR-4.3): closing a sprint (`ACTIVE → COMPLETED`) moves any
  issue not in `DONE` status either back to the Backlog (`sprintId = null`,
  default) or into a specified follow-up sprint
  (`moveIncompleteIssuesToSprintId`), chosen at close time.
- BR-4: only `LEAD` can create, start, or close a sprint; `MEMBER` can
  view sprint details.
- BR-5: a `COMPLETED` sprint is immutable (no further issue reassignment
  into/out of it) — its issue set at close time is the historical record
  used by the velocity report (`11_reports.md`).

## Database

`Sprint` — `docs/03_Database/01_Database_Design.md §2.6`.

## API

`GET/POST /projects/{projectId}/sprints`, `PATCH /sprints/{sprintId}`,
`POST /sprints/{sprintId}/start`, `POST /sprints/{sprintId}/close` —
`docs/04_API/openapi.yaml`.

## UI

Sprint lifecycle controls surface as a header bar above Backlog/Board
(no standalone sprint screen — see IA doc §2, row 8): "Start Sprint" opens
a modal requiring the dates (BR-2); "Close Sprint" opens a modal showing
incomplete issue count and the move-to choice (BR-3), using the toast+Undo
pattern is not applicable here since closing a sprint has a modal
confirmation already (an irreversible-feeling action gets an explicit
step, not a silent toast).

## Acceptance Criteria

- Given a project with an `ACTIVE` sprint, when a user attempts to start
  another sprint, then the API returns `409` and the UI explains only one
  sprint can be active.
- Given a sprint with 3 incomplete issues at close time, when the user
  closes it without choosing a follow-up sprint, then all 3 return to the
  Backlog with `sprintId = null`.
- Given a `COMPLETED` sprint, when any client attempts to reassign an
  issue into or out of it, then the request is rejected.

## Validation

`CreateSprintInput`: `name` (1–100 chars, required). `UpdateSprintInput`:
`startDate`/`endDate` (ISO date-time, `endDate > startDate` cross-field
check in the service layer, not just Zod's per-field validation).

## Future Scope

- Sprint templates / recurring cadence auto-creation.
- Burndown chart (ties into `11_reports.md`, currently scoped as
  velocity/status/cycle-time only).
- Sprint-level goals tracked as a checklist, not just free text `goal`.
