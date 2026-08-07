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
- BR-4 (Sprint Burndown, **ADR-0037**): remaining work per UTC day across a
  sprint's `startDate → min(endDate, today)`, against a straight ideal line.
  - **Cohort:** the issues in the sprint **now**. Sprint membership is not
    audited, so this is the metric's one approximation and the chart states it
    verbatim — issues added or removed mid-sprint are not reflected.
  - **Status is replayed exactly**, not approximated: `ISSUE_STATUS_CHANGED`
    rows carry `beforeData` as well as `afterData`, so the state before the
    first recorded change is known rather than assumed.
  - **Unit is the viewer's choice** — `points` (default, matching velocity) ·
    `issues` (always populated, for teams that don't estimate) · `hours`.
    Nulls contribute 0 and are counted, never imputed.
  - **Two counters always travel with the result:** `unsized` (no value for the
    chosen unit — the line is a floor) and `untrackedDone` (Done now with no
    recorded DONE transition, so replay counts them done from day one).
  - A sprint that has not started, or has no dates, returns **no series and a
    reason** — never a flat line presented as progress.
  - `ISSUE_SPRINT_CHANGED` is now audited on `SprintService.moveIssue`, so v2
    can replay true membership and draw scope-change markers.
- BR-5: reports are read-only and respect the same project-visibility
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

Screen #12 in `docs/05_UI/02_Screens_and_Information_Architecture.md`. Every
chart is built from the shared ECharts option builders (**ADR-0036**) — the
Recharts candidate noted here originally was superseded.

- **Velocity** — bar, completed points per finished sprint.
- **Sprint burndown** — line, remaining vs. ideal (ADR-0037). The only
  interactive report: a **sprint picker** and a **Points / Issues / Hours**
  toggle, both refetching this card alone rather than reloading the page.
  Beneath it, in the same place the workload page states its unestimated
  warning, sit the cohort caveat and the two honesty counters. A sprint that
  cannot be plotted renders the reason, not an empty chart.
- **Status breakdown** — donut over every live issue, Done included.
- **Cycle time** — a single stat card with its sample size; not a canvas,
  because one number is not a chart.

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

- **Burndown v2** — replay `ISSUE_SPRINT_CHANGED` for true membership, plus
  scope-change markers. Unblocked once the event has covered a full sprint.
- `sprint_daily_snapshot`, which would serve burndown v2 **and** retire
  velocity's "history moves" caveat (BR-1) in one change.
- Cumulative flow diagram.
- Custom/user-selectable date ranges (today: fixed trailing windows).
- Cross-project rollup reports.
- CSV export.
