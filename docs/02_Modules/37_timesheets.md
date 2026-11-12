# Module 37 — Timesheets (Screen 1: My Timesheet)

**Status:** v0.1 spec — **Proposed**, awaiting approval of ADR-0059 §9
**ADR:** 0059 · **Brief:** `docs/briefs/timesheets-screen1.md`
**Mockups:** `docs/05_UI/mockups/timesheets/my-timesheet-states-a.png`
(*not yet in the repo — see §5.6*), `my-timesheet-states-b.png`
**Depends on:** Time Tracking (19), Teams (20, ADR-0031/0032), Projects (03),
Issues (04), Admin capabilities (ADR-0022), Notifications (10).
**Enables:** Approvals screen, Time reports (36), the running timer (Screen 2),
HR integration (HROne), invoicing (future).

## 1. Overview

A person fills in **one week of time** in a grid — rows are work items, columns
are days — and submits it by a deadline. Approvers approve it or return
specific rows with a reason. Approved weeks lock and never change.

A row is either an **issue** or an **org-defined activity** (meetings, client
calls, HR, preparation…). Every row is **billable or non-billable**. Employees
never see rates or money.

This document covers **Screen 1, "My Timesheet"**: the owner's view of their
own week, plus the backend the whole lifecycle needs (approve and return are
API-complete here; the approver's screen comes later).

## 2. Business Rules

### Periods and policy
| | |
|---|---|
| BR-1 | **A timesheet is one person × one period.** The period is the org's week (`TimesheetPolicy.weekStartDay`, default Monday) and is stored as explicit `periodStart`/`periodEnd` dates. One timesheet per person per period. |
| BR-2 | **Policy is per org, effective-dated, and never edited in place.** A change takes effect from the next period start and is audited. Each timesheet records the policy it was created under and is always judged by it. |
| BR-3 | **Deadline** = `dueWeekday` + `dueTime` after `periodEnd`, in the policy timezone (default: Monday 11:00 for the week before). Shown as "Mon, 23 Nov, 11:00 (due in 2 days)". Submitting after it is allowed and recorded as late (ADR-0059 Q12). |

### Entries
| | |
|---|---|
| BR-4 | **Every entry is an issue XOR an activity** — enforced by a database CHECK. An activity entry may carry a project and/or a client; an activity may *require* either. |
| BR-5 | **Durations** accept `1:30`, `1.5`, `1h 30m`, `1h`, `90m`; stored as integer minutes. A bare number means **hours** (ADR-0059 Q10). One cell ≤ 24h; zero clears the cell. |
| BR-6 | **No future days** (ADR-0059 Q11). Days before today in the period, and today, are editable. |
| BR-7 | **Autosave per cell.** Every cell write is one request with OCC (`expectedVersion`, ADR-0011); a stale write is 409 and the cell shows the current value. |
| BR-8 | **A cell is the sum of that row's logs for that day.** A cell with 0–1 logs edits inline; with more than one (e.g. logged from the issue page) it opens a breakdown; nothing is merged silently (ADR-0059 Q9). |
| BR-9 | **Notes.** A log may carry a note (≤ 1000 chars). A note is *required* when the activity says so or the policy says so (`NONE | BILLABLE | ALL`). The cell shows a note marker when a note exists, and a red flag when one is required and missing. |

### Billable
| | |
|---|---|
| BR-10 | **Resolution order:** row override → issue or activity default → project default → client default → policy default (false). The resolved value is **stored** on each log when written, so later default changes never alter a submitted week. |
| BR-11 | The owner may toggle a row's billable marker only when `employeesMayOverrideBillable` is true. An override is recorded (`billableOverridden`). |
| BR-12 | **No money on this screen.** Rates, amounts and currencies are never shown to the owner. |

### Expected hours, overtime
| | |
|---|---|
| BR-13 | **Expected minutes per day** = `Organization.workingMinutesPerDay` on each of the first `workingDaysPerWeek` days of the period (the Workload basis, ADR-0034) — **minus holidays and approved leave, only when HR is connected** (`Organization.hrConnectedAt`). |
| BR-14 | **HR not connected** → leave and holidays are ignored, and the screen says so: "Leave & holidays aren't synced from HR (HROne). Expected hours are calculated for a full working week (N days)." with an *Integrate HR* link. |
| BR-15 | **Overtime** flag on a day whose total exceeds `overtimeDailyMinutes` (default: the org working day). A flag only — it never blocks. |
| BR-16 | Summary: logged vs expected (with percentage), billable total, non-billable total. A zero-expected period shows "—", never a division by zero. |

### Rows
| | |
|---|---|
| BR-17 | **Rows persist without hours** and keep their order (`position`). |
| BR-18 | **Row actions:** Edit (work item and tags), Pin / Unpin, Duplicate (work item and tags only, never hours), Move up / Move down, Remove (soft-deletes the row and its logs). |
| BR-19 | **Pinned rows** (per person) appear in every new week. "Manage recurring" lists, reorders and removes them. Unpinning never deletes this week's row. |
| BR-20 | **Copy last week** adds the previous period's rows (work item and tags) that are not already present. Never hours. |
| BR-21 | **Add row → issue:** search; suggestions are issues assigned to me, then issues I logged time on this period. Only issues I can log time on (module 19 BR-1). |
| BR-22 | **Add row → activity:** search, grouped by category, with favourites and recents. Only active activities visible to my team. |

### Lifecycle (ADR-0059 §4)
| | |
|---|---|
| BR-23 | **DRAFT** — editable by the owner. |
| BR-24 | **Submit is blocked**, with one problem per item, each linking to its cell or row, when: a required note is missing; an activity row lacks a required project or client; a day totals more than 24h; the week is empty. |
| BR-25 | **SUBMITTED** — read-only; approvers listed with their status. |
| BR-26 | **RETURNED** — only the returned rows are editable, each showing its reason; resubmitting opens a new approval round. |
| BR-27 | **APPROVED** — read-only; approvers shown with date and time; "View approval history" lists every round. |
| BR-28 | **Locked** (orthogonal to status) — every write is refused with 409, from every path: grid, issue page, API, bulk. "Edit timesheet" is disabled. |
| BR-29 | **Approvers** are resolved at submit from the policy's relations: REPORTING (the person's team manager, ADR-0032), FUNCTIONAL (ADR-0059 Q2), PROJECT (the project's LEAD, for that project's rows only — Q3). Never the owner (Q5). |
| BR-30 | **Approved** when every required approval of the current round is APPROVED. Any RETURNED decision returns the timesheet. |

### Authorization and audit
| | |
|---|---|
| BR-31 | Only the owner writes their timesheet. Approvers read the timesheet they are asked to approve; PROJECT approvers act on their project's rows only. |
| BR-32 | Out-of-scope or cross-org timesheet → `NotFoundError` (404), never 403 (F-1). |
| BR-33 | Everything is audited: `TIMESHEET_CREATED`, `TIMESHEET_ROW_ADDED/UPDATED/MOVED/REMOVED`, `WORKLOG_*` (existing), `TIMESHEET_SUBMITTED`, `TIMESHEET_APPROVED`, `TIMESHEET_ROW_RETURNED`, `TIMESHEET_RETURNED`, `TIMESHEET_LOCKED`, `TIMESHEET_POLICY_CREATED`, `PINNED_ROW_*`. |

## 3. Database

Per ADR-0059 §3; field lists in `docs/03_Database/01_Database_Design.md`
§2.21–2.30.

- **New tables (11):** `ActivityCategory`, `Activity`, `ActivityTeam`,
  `Client`, `Timesheet`, `TimesheetRow`, `PinnedTimesheetRow`,
  `TimesheetApproval`, `TimesheetPolicy`, `Holiday`, `EmployeeLeave`.
- **New enums (7):** `TimesheetStatus`, `ApproverRelation`,
  `TimesheetApprovalStatus`, `TimesheetApprovalMode`, `NotesRequirement`,
  `AvailabilitySource`, `LeaveStatus`. `FavoriteEntityType` gains `ACTIVITY`;
  `NotificationType` gains `TIMESHEET_SUBMITTED`, `TIMESHEET_RETURNED`,
  `TIMESHEET_APPROVED` (if Q15 is accepted).
- **Changed:** `WorkLog` (ADR-0059 §3.2); `Project.clientId?`,
  `Project.currency?`, `Project.defaultBillable?`; `Issue.defaultBillable?`;
  `Organization.hrConnectedAt?`; `User.functionalManagerId?` (if Q2 is
  accepted).
- **Migration:** ADR-0059 §5.

## 4. API

Contract in `docs/04_API/openapi.yaml`, tag `timesheets`. Weeks are addressed
by `periodStart` (`YYYY-MM-DD`) for the caller's own timesheet, so the client
never needs an id before the first write; the server creates the timesheet in
the same transaction as the first write. **Reads never create anything.**

| Method | Path | Purpose |
|---|---|---|
| GET | `/timesheets/me/weeks/{periodStart}` | The week: header, policy facts, days (expected, holiday, leave, weekend, overtime), rows with cells, totals, approvers, problems, permissions. A week with no timesheet yet returns `id: null` and its pinned rows as unsaved rows. |
| POST | `/timesheets/me/weeks/{periodStart}/rows` | Add a row (issue or activity, tags). |
| PUT | `/timesheets/me/weeks/{periodStart}/rows/{rowId}/cells/{date}` | Autosave one cell: `{ duration, note?, expectedVersion }`. `duration` "0" clears. |
| PATCH | `/timesheets/rows/{rowId}` | Edit a row's work item, tags or billable override (OCC). |
| DELETE | `/timesheets/rows/{rowId}` | Remove a row and its logs (soft). |
| POST | `/timesheets/rows/{rowId}/duplicate` | Duplicate a row (no hours). |
| POST | `/timesheets/rows/{rowId}/move` | `{ direction: "up" \| "down" }`. |
| POST | `/timesheets/rows/{rowId}/pin` · DELETE same | Pin / unpin as recurring. |
| POST | `/timesheets/me/weeks/{periodStart}/copy-previous` | Copy last week's rows. |
| POST | `/timesheets/me/weeks/{periodStart}/submit` | Submit; 422 with `problems[]` when blocked. |
| GET | `/timesheets/{timesheetId}/history` | Approval rounds and decisions. |
| POST | `/timesheets/{timesheetId}/approve` | Approver: `{ comment? }`. |
| POST | `/timesheets/{timesheetId}/return` | Approver: `{ rows: [{ rowId, reason }], comment? }`. |
| GET · POST | `/timesheets/me/pinned` | List / add pinned rows. |
| PATCH · DELETE | `/timesheets/me/pinned/{pinnedRowId}` | Reorder / remove. |
| GET | `/timesheets/pickers/issues?q=&periodStart=` | Issue suggestions and search (BR-21). |
| GET | `/timesheets/pickers/activities?q=&categoryId=` | Activities grouped by category, plus favourites and recents (BR-22). |
| POST · DELETE | `/activities/{activityId}/favorite` | Favourite an activity. |

**Changed (module 19):** `POST /issues/{issueId}/worklogs` and
`PATCH`/`DELETE /worklogs/{id}` now place logs into the week's timesheet and
return **409** when the week is submitted, approved or locked.

**Not in this screen:** admin CRUD for activities, categories, clients and the
policy (TS-5, TS-6); the approvals inbox (TS-9).

## 5. UI

Route **`/timesheets`** (current week) and `/timesheets?week=YYYY-MM-DD`, under
the app shell, with a **Timesheets** nav item. Built on the V2 primitives
(`AppFrame`, `Toolbar`, `DataTable` patterns, `Panel`) per
`docs/05_UI/07_Migration_Plan.md`.

### 5.1 Header
Breadcrumb "Timesheets / My Timesheet"; title; previous / next week, a week
picker ("Mon, 16 Nov – Sun, 22 Nov 2026"), **This Week**; status chip
(Draft, Submitted, Returned, Approved) and a separate **Locked** chip;
approvers (names, and in Submitted/Approved each one's status and timestamp);
deadline with "due in N days" / "overdue".

### 5.2 Summary strip
Logged / expected with a progress bar and percentage (red above 100%);
Billable; Non-billable. The HR-not-connected hint (BR-14) sits above it.

### 5.3 Grid
Columns: #, Work item (key + title, or activity name; second line project /
client / "Activity"), billable marker, one column per day (weekday + date;
**Leave** and **Holiday** labelled and tinted; weekend muted), Total, row menu.
Cells: duration, note marker, required-note flag (red), overtime day header
in red with the total ("Wed 16 Nov (10h)"). Pin icon on pinned rows. Footer
row: per-day totals and the week total.

### 5.4 Footer
Add row (Issue / Activity), Copy last week, Manage recurring, autosave status
("Autosaved just now ✓" / "Saving…" / "Couldn't save — retry"), **Submit
Timesheet**.

### 5.5 Other states
- **Submit blocked** — side panel "Can't submit timesheet" listing each
  problem with *Go to cell* / *Go to row*; the submit button reads "Fix issues
  to submit" and is disabled.
- **Returned** — banner with the approver's comment; returned rows highlighted
  with their reasons; other rows read-only.
- **Submitted** — read-only grid; approvers with status.
- **Approved / Locked** — read-only; approvers with date and time; "View
  approval history"; "Edit timesheet" disabled.
- **Empty week** — empty state with Add row and Copy last week.

### 5.6 Visual fidelity (Step 4)
Matched to the mockups after the function works. Borders, not shadows
(`#E5E7EB` as a new token); glass only on floating layers (top bar, pickers,
popovers, drawers); colours only through tokens, added — never re-valued;
existing primitives first. Light theme only. Desktop only.

**Mockup gap:** only *states B* (`my-timesheet-states-b.png`: notes,
overtime, pinned row and row menu; submit blocked; approved/locked; HR not
connected) is in the repo. *States A* (draft week, add-activity picker,
returned, submitted, empty week) has not been received; those five states are
specified from the brief's text until it is.

**Out of scope:** the running timer (Screen 2 — the top-bar slot stays),
admin settings screens, HROne sync, reports, mobile layout.

## 6. Acceptance Criteria

- An activity entry and an issue entry on the same day both save; an entry
  with both or neither is rejected by the database.
- "1:30", "1.5", "1h 30m", "90m" all store 90; "8" stores 480.
- Two people editing — or one person in two tabs — the same cell: the stale
  write gets 409 and the cell shows the current value.
- Billable resolves in the documented order; changing a project default later
  does not change a submitted week.
- With HR not connected, expected = working days × working day and the hint is
  visible; with HR connected, a holiday and an approved leave day reduce it.
- A day above the overtime threshold is flagged and still submits.
- Submit is refused for each of: missing required note, missing required
  project/client, a day over 24h, an empty week — each problem links to the
  right cell or row.
- Submit → all approvers approve → APPROVED → locked (auto-lock on).
- Submit → return two rows → only those rows are editable → resubmit → a new
  approval round; the first round stays in history.
- Every write to a locked week is 409 — grid, issue page, API.
- Another person's timesheet is 404 to a non-approver; a cross-org id is 404.
- A PROJECT approver can act only on rows of their project.
- Copy last week copies rows and never hours; duplicates no row already
  present.
- A pinned row appears in a new week; unpinning keeps this week's row.
- Move up / down persists across reloads.
- Back-filled weeks from existing logs show their hours unchanged.

## 7. Validation (Zod, shared client ↔ server)

- `periodStart`: ISO date that is a period start under the governing policy;
  otherwise 422.
- `date` (cell): ISO date within the period, not in the future.
- `duration`: string matching BR-5 → integer minutes 0…1440.
- `note`: trimmed, ≤ 1000, optional.
- Row: exactly one of `issueId` / `activityId` (cuids); `projectId?`,
  `clientId?` (cuids) only with `activityId`; `billableOverride?` boolean.
- `expectedVersion`: int ≥ 0 on every write to an existing record.
- Return: `rows` non-empty; each `reason` 1…500 chars.
- Move: `direction` ∈ `up | down`.

## 8. Future Scope

- Approvals inbox and team timesheet views (TS-9), with `VIEW_TIME_REPORTS`
  grants for non-admins.
- Admin: activities and categories (TS-5), clients (TS-5), timesheet policy
  and approver flow (TS-6), unlocking (TS-6).
- HROne: leave, holidays, reporting/functional managers (TS-7).
- Reminders and overdue nudges (TS-8, needs the production scheduler, GL-10).
- Running timer (Screen 2).
- Rates, invoicing and the Invoiced marker; accounting export; client portal
  (TS-11).
- Mobile layout (TS-12).
