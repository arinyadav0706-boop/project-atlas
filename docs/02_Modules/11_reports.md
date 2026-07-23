# Module: Reports

**Status:** v2.0 (MVP implemented) · **Owner:** Founding CTO · **Last Updated:** 2026-07-23

## Overview

Three baseline reports per project: velocity, status breakdown, and cycle
time. No new tables — velocity/status reads existing `Issue`/`Sprint`
data; cycle time reads the `ISSUE_STATUS_CHANGED` entries already written
to `AuditLog` for this purpose (`docs/03_Database/01_Database_Design.md §2.13`).

Architecture: **ADR-0020** — a pluggable **report registry** (`REPORTS` map of
`ReportDefinition`s). The API dispatches by report id; the UI renders by
`chartType`. Adding a future report (burndown, CFD, cycle/lead distributions,
workload, epic progress, release, custom) is a new registry entry — no refactor.
Reports compute on demand from live data (no aggregate tables); a compute-cache
is the documented scale seam.

## Business Rules

- BR-1 (Velocity): for each `COMPLETED` sprint (most recent ~8), report
  `completedPoints` (sum of `storyPoints` for issues in the sprint now in
  `DONE`) and `completedIssues` — the standard velocity metric.
  **`committedPoints` (say/do ratio) is deferred**: it needs a snapshot of the
  sprint's issue set *at close time*, which we don't store (completing a sprint
  moves incomplete issues out). It becomes a future `committedPoints` column
  written at close (ADR-0020) — not reconstructed from mutable current data.
- BR-2 (Status Breakdown): live count of non-deleted issues per `status`
  for the project, computed on read (no caching needed at V1 scale).
- BR-3 (Cycle Time): for issues that reached `DONE` within a trailing
  window (default 30 days, `windowDays` in the response), compute the time
  between their first `AuditLog` entry transitioning *into*
  `IN_PROGRESS` and their first entry transitioning *into* `DONE`;
  average across the sample, report `sampleSize` alongside so a
  small-sample average isn't presented as if it were statistically solid.
- BR-4: reports are read-only and respect the same project-visibility
  rules as everything else (any authenticated employee can view, per
  `03_projects.md` BR-7).

## Database

Reads `Issue`, `Sprint`, `AuditLog` (filtered `action = ISSUE_STATUS_CHANGED`)
— see `docs/03_Database/01_Database_Design.md §2.13` dual-purpose note.

## API

`GET /projects/{projectId}/reports/velocity`,
`GET /projects/{projectId}/reports/status-breakdown`,
`GET /projects/{projectId}/reports/cycle-time` — `docs/04_API/openapi.yaml`.

## UI

Screen #12 in `docs/05_UI/02_Screens_and_Information_Architecture.md`:
simple bar chart (velocity per sprint), donut/bar (status breakdown), and
a single stat card (average cycle time + sample size) — charting library
decision deferred to Phase 3 (candidate: Recharts, composable with
Tailwind, no stack ADR needed for this low-risk additive dependency).

## Acceptance Criteria

- Given a project with 3 completed sprints, when the velocity report is
  requested, then it returns committed vs. completed points per sprint in
  chronological order.
- Given a project with issues in all four statuses, when the status
  breakdown report is requested, then the counts sum to the project's
  total non-deleted issue count.
- Given fewer than 5 issues completed in the trailing window, when the
  cycle-time report is requested, then it still returns a value but
  `sampleSize` makes the small sample visible in the UI (e.g. "based on 3
  issues" caveat rendered, not hidden).

## Validation

Query params: none required beyond `projectId` path param; future date-range
params (Future Scope) would be Zod-validated the same as any other query
input.

## Future Scope

- Cumulative flow diagram.
- Custom/user-selectable date ranges (today: fixed trailing windows).
- Cross-project rollup reports.
- CSV export.
