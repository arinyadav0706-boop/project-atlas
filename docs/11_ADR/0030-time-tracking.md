# ADR-0030: Time tracking model (estimate + work logs)

**Status:** Accepted
**Date:** 2026-07-29
**Deciders:** Founding CTO
**Relates to:** V2 Epic 1 (`docs/00_Product/05_V2_Management_Visibility_Layer.md`),
04_issues.md, ADR-0011 (OCC).

## Context

V2's management-visibility layer (workload, reports) is impossible without
effort data on work. Epic 1 introduces it. Two distinct concepts:

1. **Estimate** — how long a task *should* take (a property of the issue).
2. **Work logs** — records of time actually *spent* (many, per user, per day).

We need this to be portable (plain Postgres), scalable (an issue may accrue many
logs; the workload view will aggregate across thousands of issues), and modular
(a self-contained feature, not sprawled through the issues module).

## Decision

- **`Issue.estimateMinutes` (nullable Int)** stores the original estimate on the
  issue itself — but it is **read and written through the `time-tracking`
  feature** (dedicated endpoint + service), so all effort logic lives in one
  module. Setting the estimate does **not** touch `Issue.version`; it is
  orthogonal to the OCC-protected issue-edit fields.
- **`WorkLog`** (its own model + feature) records `{issueId, userId, minutes,
  workDate, note}` with audit fields, **soft delete**, and a **`version`** for
  OCC edits (ADR-0011), mirroring comments.
- **Minutes, not hours** as the storage unit — integer, no float rounding
  errors; formatting to "1h 30m" is a presentation concern.
- **`workDate` is a DATE** (the day the work was done), separate from
  `createdAt` (when it was logged), so back-dated logs report correctly and the
  future workload view can bucket by day.
- **RBAC** (service layer, mirrors comments):
  - Log time / set estimate: project MEMBER or LEAD (`canWriteContent`), non-
    archived project, F-1 tenant scope. VIEWER cannot.
  - Edit a log: **author only** (editing someone else's recorded time would
    misrepresent it), OCC-checked.
  - Delete a log: author **or** LEAD (moderation), soft delete.
  - Read: anyone who can see the issue.
- **Indexes:** `(issueId, deletedAt)` for the issue panel; `(userId, workDate)`
  for the V2 workload aggregation to come.

## Alternatives Considered

| Option | Rejected because |
|---|---|
| Estimate as an issue-update field (thread through issue service/DTO) | More cross-module churn + test changes; time logic then splits across two modules. Keeping it in `time-tracking` is more modular. |
| Store hours as Float | Float rounding (0.1h) corrupts sums; minutes-as-int is exact. |
| Single "timeSpent" scalar on the issue (no per-log rows) | Loses *who* logged *when* — exactly what workload/reports need. |
| A running timer (start/stop) in V1 of this feature | Adds session state + edge cases (crashes, forgotten timers); manual log entry first, timer later. |

## Consequences

- **Positive:** exact sums; per-user/per-day data ready for the workload view;
  one cohesive module; portable; consistent with the comments RBAC/OCC pattern.
- **Negative / trade-offs accepted:** no live timer yet (manual entry) — logged
  as a follow-up. `estimateMinutes` sits on `Issue` but is owned by another
  feature's service — documented here so it isn't "invented" outside the issues
  module (CLAUDE.md rule 2).
- **Follow-up:** live start/stop timer; the workload aggregation (Epic 3) reads
  `WorkLog` via `(userId, workDate)`; billing/export later.
