# Module 19 — Time Tracking

**Status:** v1.0 (V2 Epic 1) · **ADR:** 0030 · **Depends on:** Issues (04),
Projects/RBAC. **Enables:** Workload view (Epic 3), Reports (Epic 4).

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
- **BR-3** Only the **author** may edit their own log (OCC, ADR-0011). Editing
  another user's recorded time is never allowed.
- **BR-4** The **author or a project LEAD** may delete a log (soft delete).
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
Live start/stop timer; billable flag + rate; CSV/billing export; workload
aggregation (Epic 3) via `(userId, workDate)`; capacity/timesheets.
