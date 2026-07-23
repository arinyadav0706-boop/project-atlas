# ADR-0020 — Reports: A Pluggable Report Registry over Existing Data

- Status: Accepted
- Date: 2026-07-23
- Deciders: Founding team

## Context

Reports (velocity, status breakdown, cycle time now; burndown, CFD, cycle/lead
distributions, workload, epic progress, release, custom later) must be added
over time **without refactoring** the module each time. They must read
**existing** data — `issues`, `sprints`, and the `ISSUE_STATUS_CHANGED` rows
already in `audit_logs` — with **no new tables and no data duplication**
(11_reports.md).

## Decision

### 1. A report registry, not a service method per report

Each report is a self-contained **`ReportDefinition`**:

```ts
interface ReportDefinition<P, D> {
  id: string;              // "velocity", "status-breakdown", "cycle-time"
  name: string;
  description: string;
  category: "delivery" | "flow" | "workload"; // for grouping in the UI
  chartType: "bar" | "donut" | "kpi" | "line"; // picks the UI renderer
  compute(actor: Actor, projectId: string, params: P): Promise<ReportResult<D>>;
}
```

All definitions live in one `REPORTS` map keyed by `id`. The API dispatches by
`id`; the UI renders by `chartType`. **Adding a report = add one definition
(+ a renderer only if it introduces a new `chartType`). No existing code
changes.** This is the extensibility line.

### 2. Read-only, computed on demand

Reports compute at read time from live data — no materialized/aggregate tables
(no duplication, always fresh). At V1 scale (≤ ~500 users, bounded projects)
this is well within budget; the seam for later is a **cache/pre-aggregation
layer behind `compute`** (memoize per (project, params, dataVersion)), added
without touching definitions or the UI.

### 3. Data sources, and one honesty boundary

- **Velocity** = completed story points per COMPLETED sprint (the standard
  metric). "Committed vs completed" needs a *completion-time snapshot* we do
  not store; it is a documented future enhancement (a `committedPoints` column
  written at sprint close), **not** reconstructed from mutable current data.
- **Status breakdown** = live GROUP BY status over non-deleted issues.
- **Cycle time** = from `audit_logs`: per issue that reached DONE in a trailing
  window, `firstInto(DONE) − firstInto(IN_PROGRESS)`, averaged, with
  `sampleSize` returned so a tiny sample isn't dressed up as significant.

### 4. RBAC

Reports are read-only and follow project visibility (03_projects.md BR-7): any
authenticated org member may view a project's reports (VIEWER included). No
mutations exist in this module.

## Consequences

- New reports are genuinely plug-and-play; **burndown** is the intended first
  post-MVP add (a `line` definition reading `audit_logs` DONE-events across the
  active sprint's dates).
- Charts are hand-rolled SVG (bar/donut/kpi) — theme-aware, dependency-free,
  on the existing design system; a `line` renderer arrives with burndown.
- Deferred (logged, rule #13): burndown, CFD, cycle/lead distributions,
  workload, epic progress, release reports, custom report builder, and a
  compute cache. All are registry additions, not refactors.
