# Module 19 — Time Tracking

**Status:** v1.0 (V2 Epic 1) · **ADR:** 0030 · **Depends on:** Issues (04),
Projects/RBAC. **Enables:** Workload view (Epic 3), Reports (Epic 4),
Timesheets (37).

> **Amendment by ADR-0059 / module 37 (accepted 2026-11-13), not yet built.**
> Every work log will belong to a weekly timesheet, and a log may point to an
> org-defined *activity* instead of an issue. The rules below marked
> **[ADR-0059]** take effect when module 37 ships; until then the original
> rules apply.

## Overview
Record **estimated** effort on an issue and log **actual** time spent against it.
The foundation of the management-visibility layer — every workload and effort
report reads this data. Inspired by Jira (Tempo) + ClickUp. Self-contained
`time-tracking` feature; effort lives in one place.

## Business Rules
- **BR-1** Any project MEMBER or LEAD (org ADMIN elevates to LEAD, ADR-0024) may
  **log their own time** on an issue they can see. VIEWER may read but not write.
  Archived projects are read-only. **Setting the estimate is LEAD-only** (BR-5) —
  a member must not be able to inflate their own budget.
- **BR-2** A work log is `{minutes, workDate, note?}` by one user. Minutes is a
  positive integer ≤ 1440 (a single log ≤ 24h). `workDate` may not be in the
  future.
- **BR-2a [ADR-0059]** A log points to **exactly one** of an issue or an
  activity (database CHECK). Logs written here are always issue logs; activity
  logs are written only from the timesheet (module 37).
- **BR-2b [ADR-0059]** Every log belongs to the timesheet for its person and
  week, and to one row of it. Logging here finds or creates that timesheet and
  the first row for this issue. **A write to a week that is SUBMITTED,
  APPROVED or locked is refused with 409**; in a RETURNED week only a returned
  row for this issue accepts writes.
- **BR-2c [ADR-0059]** Each log stores its resolved `billable` flag (module 37
  BR-10).
- **BR-3** Only the **author** may edit their own log (OCC, ADR-0011). Editing
  another user's recorded time is never allowed.
- **BR-4** The **author or a project LEAD** may delete a log (soft delete).
  **[ADR-0059]** The LEAD's moderation delete applies only while the log's
  week is DRAFT (ADR-0059 Q8); nobody removes time from a submitted, approved
  or locked week. A LEAD's delete of someone else's log is audited and **the
  author is notified** (`WORKLOG_REMOVED`).
- **BR-5** Estimate is `estimateMinutes` on the issue, integer 0…100000,
  nullable (unset = no estimate). **LEAD-only** (planning decision; org ADMIN
  elevates). Settable at **issue creation** (the create dialog shows the field
  only to leads) or later via `PUT /issues/{id}/estimate`; both enforce LEAD.
  Last-write-wins (not OCC-bound to the issue edit version).
- **BR-6** Per-issue summary = `{ estimateMinutes, loggedMinutes (Σ non-deleted
  logs), remainingMinutes (estimate − logged, may be negative = over) }`.
- **BR-7** All reads/writes are org-scoped (F-1) and audited
  (`WORKLOG_CREATED/UPDATED/DELETED`, `ISSUE_ESTIMATE_SET`).

## Database (see ADR-0030, DB design §2.18)
- `Issue.estimateMinutes Int?` (new field).
- `WorkLog { id, issueId, userId, minutes, workDate(Date), note?, version, +audit,
  deletedAt }`; indexes `(issueId, deletedAt)`, `(userId, workDate)`.

## API
- `GET  /api/issues/{issueId}/worklogs` → `{ items[], nextCursor, summary,
  canLog, canSetEstimate }` (keyset, oldest-first).
- `POST /api/issues/{issueId}/worklogs` → create a log (BR-1/2).
- `PUT  /api/issues/{issueId}/estimate` → set/clear the estimate (BR-5) → summary.
- `PATCH  /api/worklogs/{id}` → edit own log (BR-3, OCC).
- `DELETE /api/worklogs/{id}` → delete (BR-4).

## UI
A **Time Tracking** panel on the issue detail page:
- Estimate vs Logged vs Remaining, with a progress bar (over-logged shown
  distinctly).
- Editable estimate (writers only), input accepts `1h 30m` / `90m` / `1.5h`.
  **[ADR-0059 Q10, decided]** a bare number becomes **hours** ("1.5" = 1h 30m),
  matching the timesheet grid; minutes need `m`. Ships only after the founder
  has reviewed the short-duration report (ADR-0059 §5a); existing logs are
  never rewritten silently.
- "Log time" form: duration, date (default today, not future), optional note.
- Log list: person (avatar+name), date, duration, note; edit (author) / delete
  (author or LEAD) affordances. VIEWER sees read-only.

## Acceptance Criteria
- MEMBER logs time → appears in list, summary updates. VIEWER cannot (403).
- Cross-org issue → 404 (F-1). Archived project → 409.
- Future `workDate` → 422. minutes ≤ 0 or > 1440 → 422.
- Author edits own log; a non-author (even LEAD) editing → 403. Stale edit → 409.
- Author deletes own; LEAD deletes any; MEMBER deleting another's → 403.
- Estimate set/clear updates remaining; remaining may be negative when over.

## Validation
- `minutes`: int, 1…1440. `note`: ≤ 1000, trimmed, optional. `workDate`: date,
  not future. `estimateMinutes`: int 0…100000, nullable. `expectedVersion`: int
  ≥ 0 (edit).

## Future Scope
Live start/stop timer (Timesheets Screen 2); rates + CSV/billing export;
workload aggregation (Epic 3) via `(userId, workDate)`. **Billable flag and
weekly timesheets** move to module 37 (ADR-0059).
