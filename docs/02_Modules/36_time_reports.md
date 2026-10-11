# Module 36 — Time Reports (HR)

**Status:** v1.0 spec · **ADR:** 0056 · **Depends on:** Time Tracking (19),
Workload (21), Teams (ADR-0032), Admin capabilities (ADR-0022).
**Enables:** HR's two standing questions, without a spreadsheet export from
the database.

## 1. Overview

Two read-only reports over `WorkLog`:

- **Timesheet** — one person, one period, grouped by day, by project and by
  issue.
- **Team summary** — everyone in the caller's scope, one period, logged
  against capacity.

Nothing here writes. No new table, no new column — the working week this reads
has been on `Organization` since ADR-0034's amendment.

## 2. Business Rules

| | |
|---|---|
| BR-1 | **A period is a closed date range** `[from, to]`, inclusive, in whole days. Presets (this week, last week, this month, last month) resolve to explicit dates and the dates are what the URL carries, so a link to "last month" still means that month next month. |
| BR-2 | **The timesheet reconciles.** The by-day, by-project and by-issue groupings of one period sum to the same total minutes. Pinned by a test, not by review. |
| BR-3 | **Capacity** = `workingDaysInPeriod × Organization.workingMinutesPerDay`. `workingDaysInPeriod` takes the first `workingDaysPerWeek` days of each Monday-start week in the range — the same basis Workload uses (21 BR-5). |
| BR-4 | **Utilisation** = `loggedMinutes ÷ capacityMinutes`, rendered as a percentage. A zero-capacity period (a range of only non-working days) renders "—", never a division by zero and never 0%. |
| BR-5 | **The basis and the caveat are part of the number.** Every screen showing capacity or utilisation states the working week (`describeWorkingWeek`) and states that **public holidays, leave and part-time contracts are not modelled** (WL-1). A utilisation figure without that sentence is a figure someone will be judged by. |
| BR-6 | **Scope (server-side, service layer).** Anyone may read **their own** timesheet, always, with no scope check. Beyond themselves: a manager may read anyone in a team they manage plus all descendants; an org admin holding `MANAGE_TEAMS` may read anyone in the organization; everyone else gets nobody. The same `resolveScope` rule Workload enforces (21 BR-8, ADR-0032) — reused, not restated. |
| BR-7 | **Out of scope resolves to `NotFoundError`,** never `Forbidden`. A 403 confirms the person exists and which team they are in. |
| BR-8 | **Tenant isolation (F-1).** A `userId` outside the caller's organization is absent, not forbidden. |
| BR-9 | **Reports never write.** No edit, no approval, no period lock, no delete. Module 19 BR-3 keeps a work log editable only by its author; a reporting screen that could overwrite recorded time makes the record worth less than the spreadsheet it replaced. |
| BR-10 | **Bounded.** The team summary is one row per person in scope and pages at the standard size. The timesheet's by-issue grouping pages; by-day and by-project are bounded by the period itself (a 1-year range is 365 day rows at most) and the range is capped at **366 days** — a request for more is a 422, not a query that reads five years of logs. |
| BR-11 | **Soft-deleted logs are excluded** everywhere, like every other read in the product. |
| BR-12 | **Export is the same query.** CSV carries exactly the rows on screen for the current period and scope — not "everything", and not a second query that could disagree with the screen. |

## 3. Database

**No change.** This module reads:

- `work_logs` — `userId`, `issueId`, `minutes`, `workDate`, `note`, `deletedAt`,
  with the existing `(userId, workDate)` index, which is exactly the shape a
  timesheet query wants.
- `issues` → `projects` for the project grouping.
- `organizations.workingMinutesPerDay` / `workingDaysPerWeek` for capacity.

**Deliberately not added** (would need a doc change and sign-off first, rules
2 and 10): a per-person capacity or contract column, a leave/absence table, a
holiday calendar, a `billable` flag on `WorkLog`, an approval or period-lock
state. The first three are backlog **WL-1**.

## 4. API

- `GET /api/time-reports/timesheet?userId=&from=&to=&cursor=`
  → `{ person, period, workingWeek, totals: { loggedMinutes, capacityMinutes,
  utilisation, daysLogged }, byDay[], byProject[], byIssue: { items[],
  nextCursor } }`.
  `userId` defaults to the caller. Someone else's requires BR-6 scope.
- `GET /api/time-reports/team?teamId=&from=&to=&cursor=`
  → `{ period, workingWeek, scope, rows: { items[], nextCursor },
  totals }`. One row per person: `{ user, loggedMinutes, capacityMinutes,
  utilisation, daysLogged }`.
- `GET /api/time-reports/timesheet/export?…` and `…/team/export?…` → `text/csv`,
  the same rows (BR-12).

## 5. UI

A **Time** section under Workload's area of the product, on the V2 primitives
(`AppFrame`, `WorkspaceHeader`, `Toolbar`, `DataTable`, `Pagination`, `Panel`).

- **Toolbar:** period preset + explicit from/to, a person or team picker
  (only what BR-6 allows), and Export.
- **Summary panel:** logged, capacity, utilisation, days logged — with
  `describeWorkingWeek` and the BR-5 caveat directly under the utilisation
  figure, not in a tooltip.
- **Timesheet:** a by-day strip, then a `DataTable` of issues (key, title,
  project, date, minutes, note).
- **Team summary:** a `DataTable` — person, logged, capacity, utilisation,
  days logged — sorted by logged descending.
- **Empty states:** no scope ("You can only see your own time"), empty period
  ("Nothing logged between X and Y"), zero capacity.

## 6. Acceptance Criteria

- A member reads their own timesheet with no team membership at all.
- A member requesting a colleague's timesheet gets **404**, not 403.
- A manager reads a direct report and someone in a descendant team; someone in
  a sibling team is 404.
- An admin with `MANAGE_TEAMS` reads anyone in their org; a user in another org
  is 404.
- The three groupings of one period sum to the same total.
- A period containing a weekend has capacity for the working days only.
- A period of only weekends renders utilisation "—", not 0% and not `Infinity`.
- A range over 366 days is 422.
- CSV rows equal the on-screen rows for the same period and scope.
- Every screen showing utilisation shows the working week and the caveat.

## 7. Validation

Zod, one schema shared by the route and the client: `from`/`to` as ISO dates,
`to >= from`, range ≤ 366 days, optional `userId`/`teamId` as cuids, cursor as
an opaque string. An invalid range is 422 with the reason, never a silent
clamp — a report that quietly changes the period you asked for is a report you
cannot trust.

## 8. Future Scope

- **Per-person capacity** — part-time factor, leave, public holidays (WL-1).
  Until then, BR-5's caveat is the mitigation.
- **Approval and period locking** — needs a workflow design first (ADR-0056 §7).
- **Billable / non-billable** — a `WorkLog` column that does not exist and a
  definition that has not been agreed.
- **Scheduled delivery** — "email HR this report every Monday" reuses the
  recurring-job seam from module 32.
