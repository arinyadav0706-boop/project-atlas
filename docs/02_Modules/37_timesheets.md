# Module 37 — Timesheets (Screen 1: My Timesheet)

**Status:** v1.0 spec — **Accepted** with ADR-0059 (2026-11-13); not yet built
**ADR:** 0059 · **Brief:** `docs/briefs/timesheets-screen1.md`
**Mockups:** `docs/05_UI/mockups/timesheets/my-timesheet-states-a.png`
`my-timesheet-states-b.png` (the only sheet — §5.6)
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
| BR-5 | **Durations** accept `1:30`, `1.5`, `1h 30m`, `1h`, `90m`; stored as integer minutes. A bare number means **hours** (ADR-0059 Q10); the issue page adopts the same rule only after the founder reviews the short-duration report (ADR-0059 §5a). One cell ≤ 24h; zero clears the cell. |
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
| BR-24 | **Submit is blocked**, with one problem per item, each linking to its cell or row, when: a required note is missing; an activity row lacks a required project or client; a day totals more than 24h; the week is empty. **Until the Clients admin screen exists (TS-5), a required client is not enforced** (ADR-0059 Q14). |
| BR-25 | **SUBMITTED** — read-only; approvers listed with their status. |
| BR-26 | **RETURNED** — only the returned rows are editable, each showing its reason; resubmitting opens a new approval round. |
| BR-27 | **APPROVED** — read-only; approvers shown with date and time; "View approval history" lists every round. |
| BR-28 | **Locked** (orthogonal to status) — every write is refused with 409, from every path: grid, issue page, API, bulk. "Edit timesheet" is disabled. Only an org admin's **Unlock week** (BR-34) reopens it. |
| BR-29 | **Approvers** are resolved at submit, per line, from the policy's relations (ADR-0059 §6.3). REPORTING (the owner's team manager, ADR-0032) and FUNCTIONAL (`User.functionalManagerId`) approve the whole week. PROJECT (any one LEAD of the project) approves **only that project's lines — issue lines and activity lines tagged to the project**; lines with no project go to the reporting manager. **Default: REPORTING only**; the others are switched on in the policy and fully supported from day one. |
| BR-30 | **Nobody approves their own lines, anywhere.** The owner is removed from every candidate set; an emptied slot falls back — PROJECT: another LEAD of that project → the reporting manager → an org admin; REPORTING/FUNCTIONAL: an org admin (also when the owner has no team manager or manages their own team). One person in several slots decides once. **No eligible approver at all → auto-approved at submit**, `autoApproved = true`, audited as "no other approver available". |
| BR-30a | **Approved** when every required approval of the current round is APPROVED. Any RETURNED decision returns the timesheet. |

### Authorization and audit
| | |
|---|---|
| BR-31 | Only the owner writes their timesheet. Approvers read the timesheet they are asked to approve; PROJECT approvers see and act on their project's lines only. |
| BR-32 | Out-of-scope or cross-org timesheet → `NotFoundError` (404), never 403 (F-1). |
| BR-33 | Everything is audited: `TIMESHEET_REOPENED` (an unlocked approved week edited back to DRAFT), `TIMESHEET_ROWS_COPIED`, `TIMESHEET_APPROVAL_DECIDED`, `TIMESHEET_CREATED`, `TIMESHEET_ROW_ADDED/UPDATED/MOVED/REMOVED`, `WORKLOG_*` (existing), `TIMESHEET_SUBMITTED`, `TIMESHEET_APPROVED`, `TIMESHEET_ROW_RETURNED`, `TIMESHEET_RETURNED`, `TIMESHEET_LOCKED`, `TIMESHEET_AUTO_APPROVED`, `TIMESHEET_UNLOCKED`, `TIMESHEET_POLICY_CREATED`, `PINNED_ROW_*`. |
| BR-34 | **Unlock week** — an org admin may unlock someone else's locked week. A reason (1–500 chars) is required; the action is audited (`TIMESHEET_UNLOCKED`, with the reason and the previous lock time) and the owner is notified. Status is kept; any edit to an unlocked APPROVED week returns it to DRAFT for re-approval. Nobody unlocks their own week. A week locked by the policy's age rule (`lockAfterDays`) is not a person's lock and cannot be unlocked this way (TS-17). |
| BR-35 | **In-app notifications:** approvers on submit; the owner on return, approval, auto-approval and unlock; a log's author when a project LEAD removes it from a DRAFT week (module 19 BR-4). Email and reminders later (TS-8). |

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
the same transaction as the first write. **Reads never create anything.** In a
week that does not exist yet, the owner's pinned rows come back with the id
`pinned:<pinnedRowId>`; a cell write to such a row creates the week (with all
its pinned rows) and lands on the right one.

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
| POST | `/timesheets/{timesheetId}/unlock` | Org admin: `{ reason }` (BR-34). Never the owner. |
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

Route **`/timesheets`** (current week), `/timesheets?date=YYYY-MM-DD` (the week
containing that date, under any week-start policy) and
`/timesheets?timesheet=<id>` (a notification link: the owner's own week, or —
for an approver or org admin — a read-only view of someone else's week with
**Approve**, **Return lines** and **Unlock week** where allowed; the full
approvals inbox is TS-9). Under the app shell, with a **Timesheets** nav item. Built on the V2 primitives
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
  approval history"; "Edit timesheet" disabled. An **auto-approved** week says
  so ("Approved automatically — no other approver available").
- **Unlock week** — on a locked week, org admins (never the owner) see an
  "Unlock week" action that asks for a reason; the owner later sees who
  unlocked it, when and why.
- **Empty week** — empty state with Add row and Copy last week.

### 5.6 Visual fidelity (Step 4)
Matched to the mockups after the function works. Borders, not shadows
(`#E5E7EB` as a new token); glass only on floating layers (top bar, pickers,
popovers, drawers); colours only through tokens, added — never re-valued;
existing primitives first. Light theme only. Desktop only.

**Mockups:** `my-timesheet-states-b.png` is the single reference (founder,
2026-11-13 — there is no separate "states A"): notes, overtime, pinned row and
row menu; submit blocked; approved/locked; HR not connected. The other states
(add-activity picker, returned, submitted, empty week) follow its visual
language. The mockup is the floor, not the ceiling: generous 8–12px radii on
cards and panels, 6–8px on inputs and chips, comfortable spacing, precise grid
alignment, a clear type hierarchy and polished interactions.

**Step 4 — as built (2026-11-13).** New tokens, added (never re-valued) in
`globals.css` / `tailwind.config.ts`: `line` (#E5E7EB hairline), `glass`
(floating-layer surface), `holiday`, and text "inks" `warning-ink`,
`leave-ink`, `holiday-ink`, `success-ink`, `danger-ink`, `primary-ink`. The
inks exist because the mockup's bright orange, green, purple, red-on-tint and
brand blue measured below 4.5:1 as small text (e.g. red on the overtime tint
4.24:1, brand blue 4.46:1, white on the brand-blue button 4.46:1); every ink
measures ≥ 4.5:1 on white and on its tint. Glass (translucent surface + blur)
is applied only to floating layers — row menu, add-row menu, popovers, dialogs,
the submit-blocked panel and the sticky footer — locally, so shared primitives
and other screens are unchanged. Controls are 8px radius, cards and panels
12–16px, no shadows on content. No new shared primitive was needed.

**Step 3 notes (2026-11-13):** "Integrate HR" is shown as *coming soon* until
the HR screen exists (TS-7). A cell holding several logs explains itself but
does not yet edit them in place (TS-18). The deadline and decision times are
rendered in the viewer's own clock, in the browser only.

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
- With REPORTING + PROJECT enabled: the project LEAD sees and decides only
  their project's rows; the week is APPROVED only when both have approved.
- A person with no team manager is routed to an org admin.
- Migration: past weeks are frozen with hours unchanged; the migration week
  stays an open DRAFT.
- Submit → return two rows → only those rows are editable → resubmit → a new
  approval round; the first round stays in history.
- Every write to a locked week is 409 — grid, issue page, API.
- Another person's timesheet is 404 to a non-approver; a cross-org id is 404.
- A PROJECT approver can act only on rows of their project, including
  activity rows tagged to it; rows with no project go to the reporting manager.
- A project LEAD's own lines on their own project go to another LEAD, else the
  reporting manager, else an org admin — never to themselves.
- In a one-admin organization the admin's own week is auto-approved, with the
  audit entry "no other approver available".
- An org admin unlocks a locked week only with a reason; the owner is
  notified; an admin cannot unlock their own week.
- A LEAD removing another person's log works only in a DRAFT week, is audited,
  and notifies the author.
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
- Unlock: `reason` trimmed, 1…500 chars.
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
