# Reporting Roadmap — Jira Gap Analysis (EAGLES)

**Status:** Planning · **Last Updated:** 2026-07-23 · Related: `docs/02_Modules/11_reports.md`, ADR-0020

Gap analysis of Jira's reporting suite against EAGLES' current data model, to
plan Jira-parity reporting while preserving the modular report registry
(ADR-0020). Nothing here is implemented yet beyond the MVP (Velocity, Status
breakdown, Cycle time).

## Data we have today

`issues` (type, status, priority, assignee, reporter, sprintId, epicId,
storyPoints, dueDate, timestamps, soft-delete) · `sprints` (status, start/end
dates, position) · **`audit_logs`** — every `ISSUE_STATUS_CHANGED` with
before/after status + timestamp + actor (the engine for flow reports) ·
`comments` · `attachments` · `labels` (org) · `components` (project, + owner) ·
`projectMembers`/roles.

**Not present:** worklogs/time-tracking, original/remaining estimates (only
story points), releases/versions (`fixVersion`), team capacity, resolution
field, custom fields.

## Tier 1 — Buildable today, **no schema change** (registry adds)

| Report | Data used | Notes |
|---|---|---|
| Velocity ✅ | sprints + issues.storyPoints | needs story points to be set (see below) |
| Status breakdown ✅ / Distribution | issues groupBy | generalize to type/priority/assignee/label/component/epic |
| Cycle time ✅ | audit_logs (IN_PROGRESS→DONE) | |
| Lead time | issues.createdAt → first DONE (audit_logs) | |
| Throughput | audit_logs DONE events, bucketed | |
| Sprint Burndown / Burnup | sprint dates + audit_logs DONE + points | count-mode works without points |
| Cumulative Flow (CFD) | audit_logs replay (status per day) | heavier compute; cache later |
| Control chart | audit_logs | cycle-time scatter over time |
| Created vs Resolved | issues.createdAt vs first DONE | |
| Average age / Resolution time | createdAt, DONE transition | |
| Epic progress | issues where epicId = epic, by status | epicId link exists |
| Sprint report (issue list) | sprint issues + status | |
| Workload by assignee (count/points) | issues groupBy assigneeId | |

## Tier 2 — Minor additions (a field or small table)

| Report | Exact addition |
|---|---|
| Commitment (committed vs completed velocity) | `Sprint.committedPoints`, snapshotted at sprint close |
| Release Burndown / Version report | **Versions module**: `Version` table (name, releaseDate, status, projectId) + `Issue.versionId` |
| Sprint capacity vs load | `ProjectMember.capacity` or a `SprintCapacity` row |
| Fast CFD/throughput at scale | optional daily snapshot (pre-aggregated status counts) — a cache, not new source data |

## Tier 3 — New modules / architecture

| Report | Needs |
|---|---|
| Time tracking / logged vs estimated | **Worklog module** (`Worklog`: issueId, userId, minutes, date) + `Issue.originalEstimate`/`remainingEstimate` |
| User workload (time-based) | same |
| Custom-field / SLA / environment reports | custom-fields subsystem |
| Cross-project / portfolio dashboards | dashboard/gadget framework (org-level) |

## Architectural recommendations

1. **Registry (ADR-0020) is the single extension point** — all of Tier 1 is registry entries; page/API unchanged.
2. **One generic "Distribution" report** parameterized by `groupBy` collapses Jira's several pie/single-level-group-by reports into one definition.
3. **Shared `dateRange` + `timeBucket` param convention** (week/sprint/month) reused by throughput, created-vs-resolved, CFD, burnup.
4. **Write `Sprint.committedPoints` at close** — the only real velocity gap; unlocks commitment reporting cheaply.
5. **Compute-cache seam behind `compute()`** before scale bites; daily snapshot table only if audit-log replay for CFD gets slow.
6. **Data-unlock order:** Versions → cache/snapshot → Worklog + estimates → custom fields / dashboards.

## Recommended phased roadmap

- **R1 (now, no schema):** Burndown, Burnup, Throughput, Lead time, Created-vs-Resolved, CFD, generic Distribution, Epic progress. ≈ 80% of Jira's agile reporting, all registry adds.
- **R2 (tiny migration):** `Sprint.committedPoints` (commitment velocity); Versions module (release reports).
- **R3 (scale):** compute-cache + optional daily snapshot for CFD/throughput.
- **R4 (new modules):** Worklog + estimates (time tracking/workload); later custom fields & org dashboards.

## Immediate prerequisite (blocks Velocity)

Story points exist in the schema/API and render on the issue detail **if set**,
but there is **no UI input** to set them (not in Create or Edit issue). Add a
story-points field to the issue create/edit dialogs so Velocity (and points-mode
burndown) have data. Small, no schema change.
