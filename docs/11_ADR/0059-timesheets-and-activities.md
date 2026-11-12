# ADR-0059: Weekly timesheets, org-defined activities, and approval

**Status:** Accepted (2026-11-13) — every §9 question decided by the founders
**Date:** 2026-11-12
**Deciders:** Founders
**Module:** `docs/02_Modules/37_timesheets.md`
**Brief:** `docs/briefs/timesheets-screen1.md`
**Mockups:** `docs/05_UI/mockups/timesheets/`
**Amends:** ADR-0030 (time tracking: `WorkLog.issueId` becomes optional; logs
belong to a weekly timesheet). **Relates to:** ADR-0011 (OCC), ADR-0022
(capabilities), ADR-0032 (manager visibility), ADR-0034 (working week),
ADR-0056 (time reports — its §4 is superseded by §6.4 below).

---

## 1. Context

Time today is a list of `WorkLog` rows, each tied to one issue, written from
the issue page (module 19). That serves "how long did this ticket take". It
does not serve the companies EAGLES is now being sold to — IT services firms,
agencies and product startups — who need:

- **A weekly timesheet** a person fills in, submits by a deadline and gets
  approved, after which it cannot change.
- **Time that is not an issue**: meetings, client calls, HR activities,
  preparation. Today that time is either lost or logged against a fake
  "Meetings" ticket, which pollutes every issue report.
- **A billable flag** on every hour, so a services firm can tell billable from
  internal time — without employees seeing money.

The founder's product decisions are fixed (brief §1). This ADR turns them into
a data model, a lifecycle, and a migration for the rows that already exist.

## 2. Decision in one sentence

`WorkLog` stays the **single record of time**, now pointing to either an issue
or an org-defined activity and always belonging to a weekly `Timesheet`; the
timesheet carries the lifecycle (Draft → Submitted → Approved, with Return and
an orthogonal Lock), and every rule is an effective-dated per-org policy.

## 3. Data model

New tables are org-scoped (F-1) and carry the standard audit fields
(`createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`) unless noted.
Full field lists live in `docs/03_Database/01_Database_Design.md` §2.21–2.30.

### 3.1 What the time was for

| Table | Purpose |
|---|---|
| `ActivityCategory` | Groups activities in the picker ("Meetings", "HR", "Pre-sales"). Unlimited, ordered, archivable. |
| `Activity` | An org-defined non-issue work type. Carries `billable` (nullable = inherit), `requiresProject`, `requiresClient`, `notesRequired`, `visibleToAllTeams`, `archivedAt`. |
| `ActivityTeam` | Which teams see an activity when `visibleToAllTeams = false`. |
| `Client` | Minimal: `name`, `currency` (ISO 4217), `defaultBillable`, `archivedAt`. |
| `Project` (+3 columns) | `clientId?`, `currency?` (null = the client's), `defaultBillable?` (null = the client's). |
| `Issue` (+1 column) | `defaultBillable?` — null inherits from the project. Needed because the founder's resolution order names an issue-level default. |

`FavoriteEntityType` gains `ACTIVITY`, so activity favourites reuse the
existing `Favorite` table instead of a new one. **Recents are derived** from
the user's own work logs (last distinct activities), so no table is added for
them.

### 3.2 The record of time — `WorkLog` (amended)

| Change | Why |
|---|---|
| `issueId` → **optional** | Activity time has no issue. |
| `+ activityId?` | The other kind of entry. |
| **CHECK `num_nonnulls(issueId, activityId) = 1`** | Exactly one, enforced by Postgres, not by hope. |
| `+ organizationId` (required, backfilled) | Scoping currently goes through `issue → project → org`; an activity log has no issue, so it needs its own tenant column (F-1). |
| `+ projectId?`, `+ clientId?` | Tags on **activity** entries ("Client meeting" for Northwind). Issue entries derive their project from the issue, so it is never stored twice. |
| `+ billable`, `+ billableOverridden` | The resolved flag is **stored**, not recomputed at read time, so changing a project default later never rewrites a submitted week. |
| `+ timesheetId`, `+ timesheetRowId` (required after backfill) | Every hour belongs to exactly one week and one grid row; this is what makes "locked means immutable" enforceable. |

`issueId`/`activityId`/`projectId`/`clientId` are a **copy of the row's work
item**, written in the same transaction as the row. They stay on the log
because the issue panel (module 19) and Workload read logs by `issueId`, and
because the record of what time was spent on must survive a row being
removed. The service is the only writer; a test pins row ↔ log agreement.

**Refinement from the brief — returns live on the row, not the log.** The
brief proposed `WorkLog.returnedReason`. An approver returns a *line*, and a
line in the grid is a row spanning seven days (up to seven logs). Putting the
reason on each log would let the seven disagree. So `TimesheetRow` carries
`returnedAt`, `returnedById`, `returnedReason`; the history of every return
is in `AuditLog` (`TIMESHEET_ROW_RETURNED`).

**One cell, possibly several logs.** A person can still log time from the
issue page (module 19), and that can produce two logs for the same issue on
the same day. The grid shows the **sum**. A cell with zero or one log is
edited inline; a cell with more than one opens a small breakdown so each log
is edited on its own (Tempo behaves the same way). Nothing is merged
silently. See open question Q9.

### 3.3 The week — `Timesheet`, `TimesheetRow`, `PinnedTimesheetRow`

| Table | Key fields |
|---|---|
| `Timesheet` | `userId`, `periodStart`, `periodEnd` (dates), `status`, `submittedAt`, `approvedAt`, `lockedAt`, `lockedById`, `policyId`, `expectedMinutesAtSubmit`, `version` (OCC). Unique `(userId, periodStart)`. |
| `TimesheetRow` | `timesheetId`, `position`, the work item (`issueId` xor `activityId`, `projectId?`, `clientId?`), `billableOverride?`, `pinnedRowId?`, return fields. Persists rows that have no hours yet, and their order. |
| `PinnedTimesheetRow` | `userId`, the same work item fields, `position`. Instantiated into each new week. |

**Duplicate rows are allowed** — the brief's *Duplicate* action copies a row's
work item and tags into a new row. So a row is identified by its id, never by
its work item, and logs reference the row.

### 3.4 Approval — `TimesheetApproval`

One row per **required approver per submission round**: `timesheetId`,
`round`, `relation` (`REPORTING | FUNCTIONAL | PROJECT`), `projectId?` (for
`PROJECT`), `approverId`, `fallbackFrom?` (the relation it stands in for, when
resolved through a §6.3 fallback), `sequence`, `status`
(`PENDING | APPROVED | RETURNED | SKIPPED`), `decidedAt`, `comment`.
`Timesheet.autoApproved` marks a week approved because no other approver
existed (§6.3). Rounds
are never deleted, so "View approval history" is a plain read.

### 3.5 Policy — `TimesheetPolicy` (effective-dated)

One row per org per **effective period**: `effectiveFrom` (always a period
boundary), `timezone`, `weekStartDay`, `dueWeekday`, `dueTime`,
`reminderHoursBeforeDue[]`, `autoLockOnApproval`, `lockAfterDays?`,
`overtimeDailyMinutes?` (null = the org working day), `notesRequired`
(`NONE | BILLABLE | ALL`), `employeesMayOverrideBillable`,
`approverRelations[]`, `approvalMode` (`PARALLEL | SEQUENTIAL`),
`defaultBillable`.

**Policy rows are never updated.** A change inserts a new row whose
`effectiveFrom` is the next period start, and is audited. Each `Timesheet`
stores the `policyId` it was created under, so a submitted or approved week
is always judged by the rules it was filled in under.

Defaults (shipped, editable later in Admin): week starts **Monday**; due
**Monday 11:00** (policy timezone) for the previous week; reminders 24h and
2h before due; auto-lock on approval; overtime above the org working day;
notes required for **none** (activities can still demand them); employees
**may** override billable; approvers **reporting manager** only, parallel
(Q4, decided — multiple approvers are fully supported and switchable).

### 3.6 Availability — `Holiday`, `EmployeeLeave`, `Organization.hrConnectedAt`

`Holiday` (`date`, `name`, `source`, `externalId?`) and `EmployeeLeave`
(`userId`, `date`, `minutes`, `type`, `status`, `source`, `externalId?`) are
written **only** by the HR integration (HROne, a later screen) — and by seeds
and tests until then. `Organization.hrConnectedAt` (null = not connected)
gates their use: when null, expected hours ignore both tables and the screen
says so (mockup B, frame 4).

They are added now, not with the HR integration, because Screen 1's grid must
render the leave and holiday column states (mockup B, frames 1–3) against real
rows, and the expected-hours rule needs to be written and tested once.

## 4. Lifecycle

```
          submit                  all approvals
 DRAFT ───────────▶ SUBMITTED ───────────────────▶ APPROVED
   ▲                    │                              │
   │   resubmit         │ return (rows + reason)       │ lock (auto or rule)
   └──── RETURNED ◀─────┘                              ▼
                                                 lockedAt set
```

- **DRAFT** — fully editable by its owner. Autosaved per cell.
- **SUBMITTED** — read-only to the owner; approvers act. The owner sees each
  approver and their status.
- **RETURNED** — only the returned rows are editable, each showing its reason;
  the owner resubmits, which opens a new approval round.
- **APPROVED** — read-only; approvers shown with date and time.
- **Lock** is **orthogonal** to status (`lockedAt`), because lock rules can
  freeze a week that was never submitted ("lock anything older than 30 days").
  A locked week rejects every write — from the grid, the issue panel, the API
  and bulk paths — with 409, until an org admin unlocks it with a reason
  (§6.5). The mockup shows *Approved* and *Locked* as two
  chips for exactly this reason.
- **Invoiced** is future scope and will be a further orthogonal marker, not a
  status.

Submit is refused (422 with a list of problems, each pointing to a cell or a
row) when: a required note is missing; an activity entry lacks a required
project or client; a day totals more than 24h; or the week is empty.

## 5. Migration of existing `WorkLog` rows

One migration, set-based SQL, safe to re-run. Order:

1. Create the new tables and enums; seed one default `TimesheetPolicy` per org
   (`effectiveFrom` = the Monday on or before the migration date).
2. Add `organizationId`, backfill from `issue → project`, then make it
   `NOT NULL`.
3. Make `issueId` nullable; add `activityId`; add the CHECK constraint.
4. Add `billable = false`, `billableOverridden = false` to every existing log
   (no project or client defaults exist yet, so every resolution lands on the
   policy default, false).
5. Create one `Timesheet` per distinct `(userId, Monday-start week)` that has
   logs, and one `TimesheetRow` per distinct `(timesheet, issueId)`, positioned
   by first logged date; point every log at both; then make `timesheetId` and
   `timesheetRowId` `NOT NULL`.
6. Back-filled weeks before the migration week are **frozen**: DRAFT with
   `lockedAt` = migration time and `lockedById` null. **The week containing the
   migration date stays an open DRAFT.** Nothing is marked approved — no
   approval that did not happen is fabricated (Q1, decided).

### 5a. Report before the duration-input change (Q10)

Today the issue page reads a bare "1.5" as 2 minutes and "8" as 8 minutes, so
some existing logs may be hours recorded as minutes. Before the input changes,
`scripts/worklog-short-durations.sql` (read-only) lists every log of **under
15 minutes**, bucketed (`<5`, `5–14`) and grouped by person, for the founder to
review. Any correction is a separate, explicit, audited step that the founder
approves row by row; the migration itself never changes `minutes`.

**Deploy note.** Since DB-9, every push to `main` runs `prisma migrate deploy`
against production Supabase and fails the deploy if a migration fails. This
migration will be rehearsed against a copy of the VERUS demo dataset (~8k
issues) before it reaches `main`.

## 6. Authorization (service layer)

### 6.1 Own timesheet
Only the owner writes their timesheet, and only while the week's state allows
it (§4). No admin, manager or LEAD writes into someone else's week.

### 6.2 Module 19 changes
- Logging time from the issue page writes into that week's timesheet
  (creating it if needed, onto the first matching row or a new one), and is
  refused with 409 when the week is submitted, approved or locked.
- **BR-4's LEAD moderation delete** is narrowed to weeks still in DRAFT; a
  LEAD can never remove time from a submitted or locked week. The delete is
  audited and **the author is notified** (Q8).
- **Bare numbers mean hours** in the issue page's inputs too (Q10) — but that
  input change ships only **after** the founder has reviewed the report of
  existing logs that look like this bug (§5a). Existing data is never changed
  silently.

### 6.3 Approvers (Q3, Q4, Q5)
Resolved at submit, per line, from the policy's `approverRelations`:

- **REPORTING** approves the whole week: the owner's team manager (ADR-0032).
- **PROJECT** (when enabled) approves **only the lines of their project** —
  issue lines in that project and **activity lines tagged to it**. Any one
  LEAD of the project may act. Lines with no project (an HR activity, say) are
  approved by the reporting manager alone.
- **FUNCTIONAL** (when enabled) approves the whole week:
  `User.functionalManagerId`.

**Nobody ever approves their own lines, anywhere in the flow.** The owner is
removed from every candidate set, and a slot that empties falls back in
order: for a PROJECT slot, **another LEAD of that project → the reporting
manager → an org admin**; for a REPORTING or FUNCTIONAL slot, **an org admin**
(also the case when the owner has no team manager, or manages their own
team). An approver appearing in several slots decides once for all of them.

If **no other eligible approver exists at all** (e.g. a one-admin startup),
the week is **auto-approved** at submit: `Timesheet.autoApproved = true` and
an `AuditLog` entry `TIMESHEET_AUTO_APPROVED` with the reason "no other
approver available". It is never silent.

An approver may read the whole timesheet they are asked to approve; a PROJECT
approver sees and acts on **their project's lines only**.

### 6.4 Who sees whose hours (supersedes ADR-0056 §4)
Everyone sees their own. Managers see their teams and descendant teams (the
ADR-0032 set). Anyone else needs the new capability **`VIEW_TIME_REPORTS`**
(founder decision, 2026-11-12). Screen 1 shows only your own week, so this
capability is *declared* in Step 2 but first *used* by the reports and
approvals screens — see Q6 for how it reaches a non-admin.

### 6.5 Unlocking a week (Q13)
An **org admin** may unlock a locked week from the timesheet itself, now —
not deferred to the admin screens. A **reason is required** (1–500 chars);
the action is audited (`TIMESHEET_UNLOCKED`, with the reason and the previous
`lockedAt`) and **the owner is notified**. Unlocking clears `lockedAt` and
leaves `status` as it was: an approved week becomes an approved-but-unlocked
week, and editing it returns it to DRAFT so it must be re-approved. An admin
cannot unlock their own week (Q5's rule applies).

## 7. Alternatives considered

| Option | Rejected because |
|---|---|
| A separate `TimesheetEntry` table beside `WorkLog` | Two records of time; Workload, the issue panel and reports would each have to pick one, and they would disagree. ADR-0056 §6's rule — one table, one owner — applies. |
| A placeholder "Meetings" issue per project for non-issue time | Pollutes issue counts, velocity and search; cannot carry `requiresClient` or `notesRequired`. |
| `Locked` as a status value | A week can be locked without ever being approved (lock rules); a single status cannot say both. |
| Recompute billable at read time | A later change to a project default would silently rewrite submitted and approved weeks. |
| Mutable policy row | Breaks "a policy change applies from the next period only"; the audit trail would show a value with no way to know which weeks it governed. |
| Return reason per log | A line spans up to seven logs; per-log reasons can disagree (§3.2). |

## 8. Consequences

- **Positive:** one source of time for issues, activities, Workload and
  reports; immutability is a database-backed state, not a UI convention;
  policy changes never rewrite history; non-issue time stops polluting issue
  reports.
- **Negative / accepted:** `WorkLog` carries a denormalised copy of its row's
  work item (guarded by the service and a test); the migration touches every
  existing log; 11 new tables, 7 new enums (+1 value on an existing one), and
  new columns on `WorkLog`, `Project`, `Issue`, `Organization` (listed in
  `03_Database/01_Database_Design.md` §2.21–2.30).
- **Follow-up:** admin screens for activities, clients and policy; the HROne
  integration; reminders (needs the production scheduler, GL-10); the
  approvals screen; invoicing — all in the backlog (TS-1…TS-13).

## 9. Decisions (all questions closed 2026-11-12 / 2026-11-13)

| # | Question | Decision |
|---|---|---|
| Q1 | Status of back-filled weeks | Past weeks **frozen** (DRAFT + `lockedAt` at migration, no approvals created, never overdue); the migration week stays an open DRAFT. |
| Q2 | Where a functional manager is stored | `User.functionalManagerId?`, the same shape HROne exports. |
| Q3 | Project-manager scope | A project LEAD approves only that project's lines — issue lines **and activity lines tagged to the project**; any one LEAD may act. Lines with no project go to the reporting manager. |
| Q4 | Default approvers | Reporting manager only by default; multiple approvers (REPORTING, FUNCTIONAL, PROJECT; parallel or sequential) supported from day one and switchable in the policy. |
| Q5 | No approver / self-approval | **Nobody approves their own lines anywhere.** Fallbacks per §6.3; no team manager → org admin; no eligible approver at all → **auto-approved with an audit entry** "no other approver available". |
| Q6 | `VIEW_TIME_REPORTS` for non-admins | Later, with the approvals/reports screen (TS-9); Screen 1 does not use it. |
| Q7 | Timezone for the deadline | Required IANA `timezone` on `TimesheetPolicy`. |
| Q8 | LEAD deleting someone's log | Only while the week is DRAFT; audited; **the author is notified**. |
| Q9 | Several logs in one cell | Breakdown to edit each; never merged silently. |
| Q10 | Bare numbers | **Hours everywhere**, including the issue page — after the founder reviews the short-duration report (§5a); existing data is never changed silently. |
| Q11 | Future days | Not allowed. |
| Q12 | Late submission | Allowed, marked late. |
| Q13 | Unlocking | **Now**, not deferred: org admins unlock a locked week with a required reason; audited; owner notified (§6.5). |
| Q14 | Activities and clients | Seeded, editable default activity list per org; sample clients only in dev/demo seeds; "client required" not enforced until the Clients screen exists (TS-5). |
| Q15 | Notifications | In-app on submit, return, approve — plus unlock (Q13) and a LEAD's delete (Q8). Email and reminders later. |
| Q16 | Week-start change | One shorter or longer transition period is allowed. |
