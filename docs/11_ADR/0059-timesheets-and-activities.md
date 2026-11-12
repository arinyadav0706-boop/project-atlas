# ADR-0059: Weekly timesheets, org-defined activities, and approval

**Status:** Proposed — Q1, Q4, Q14 decided and Q5 partly decided (2026-11-12); the rest of §9 awaits founder approval
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
`PROJECT`), `approverId`, `sequence`, `status`
(`PENDING | APPROVED | RETURNED | SKIPPED`), `decidedAt`, `comment`. Rounds
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
  and bulk paths — with 409. The mockup shows *Approved* and *Locked* as two
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
  LEAD can never remove time from a submitted or locked week (Q8).

### 6.3 Approvers
An approver may read the whole timesheet they are asked to approve, and
approve or return it. `PROJECT` approvers see and act on **their project's
rows only** (Q3).

### 6.4 Who sees whose hours (supersedes ADR-0056 §4)
Everyone sees their own. Managers see their teams and descendant teams (the
ADR-0032 set). Anyone else needs the new capability **`VIEW_TIME_REPORTS`**
(founder decision, 2026-11-12). Screen 1 shows only your own week, so this
capability is *declared* in Step 2 but first *used* by the reports and
approvals screens — see Q6 for how it reaches a non-admin.

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

## 9. Open questions (answer before Step 2)

| # | Question | Recommendation |
|---|---|---|
| Q1 | Status of back-filled weeks. | **DECIDED 2026-11-12:** past weeks are **frozen** (DRAFT + `lockedAt` at migration, no approvals created, never overdue); **the week containing the migration date stays an open DRAFT**. |
| Q2 | Where is a **functional manager** stored? There is no field today. | `User.functionalManagerId?` — one column, the same shape HROne exports, and the HR sync can fill it later. |
| Q3 | Does a **project manager** approve only their project's rows, and who is the project manager — any project `LEAD`? | Yes, only that project's rows; any one LEAD of the project may act. Rows with no project are approved by the reporting manager. |
| Q4 | Default approver set. | **DECIDED 2026-11-12:** default **reporting manager only**, but the model and the service support **multiple approvers from day one** — REPORTING, FUNCTIONAL and PROJECT (project LEADs approving their project's rows), parallel or sequential — switchable in the policy. Screen 1's tests cover the multi-approver path, not just the default. |
| Q5 | No approver found. | **PARTLY DECIDED 2026-11-12:** someone with **no team manager** is approved by an **org admin**. Still open: self-approval (a manager who is their own team's manager) — recommendation: treat as "no manager" → org admin; never self-approve. |
| Q6 | `VIEW_TIME_REPORTS` must reach HR people who are not org admins, but today **only ADMINs hold any capability** (`resolveCapabilities`). Add a capability-grant table now, or later with the reports screen? | Later, with the reports/approvals screen (TS-9). Screen 1 does not use it. |
| Q7 | **Timezone** for the due time (e.g. Monday 11:00). Organizations have no timezone today. | A required `timezone` on `TimesheetPolicy` (IANA, e.g. `Asia/Kolkata`), set when the org is created. |
| Q8 | Module 19 BR-4 lets a project LEAD delete anyone's log. Keep that only for DRAFT weeks? | Yes, DRAFT only. |
| Q9 | A cell with **several logs** (e.g. two logged from the issue page): breakdown popover, or merge them into one? | Breakdown popover; never merge silently. |
| Q10 | **Bare numbers.** The issue panel reads "90" as 90 minutes and "1.5" as 2 minutes; the brief wants "1.5" = 1.5 hours. One rule everywhere? | Yes: a bare number means **hours** everywhere ("1.5" = 1h 30m, "8" = 8h); minutes need an `m` ("90m"). Changes module 19's input once. |
| Q11 | **Future days.** Module 19 forbids logging on a future date. Keep that in the grid (no pre-filling Friday on Wednesday)? | Keep it. |
| Q12 | **Late submission**: allowed after the deadline (and shown as late), or blocked until a manager reopens it? | Allowed, marked late. |
| Q13 | **Unlocking**: if a locked week is wrong, can anyone unlock it? | An org admin can unlock with a mandatory reason, audited — built with the admin screens (TS-6). Until then, locked is final. |
| Q14 | Activities and clients before their admin screens. | **DECIDED 2026-11-12:** every org gets a **seeded, editable default activity list**. **Sample clients only in dev/demo seeds** (`prisma/seed.ts`, VERUS), never in a real org. Until the Clients screen exists (TS-5), **"client required" is not enforced** (`CLIENT_REQUIRED` is not raised). |
| Q15 | **Notifications**: send in-app notifications on submit, return and approve as part of Screen 1? Needs 3 new `NotificationType` values. | Yes, in-app only. Email and reminders wait for the email module and the production scheduler. |
| Q16 | **Week-start change**: when a policy moves the week from Monday to Sunday, the transition period is 6 or 8 days. Allow that one odd-length period? | Yes; `periodStart`/`periodEnd` are explicit, so nothing assumes 7 days. |
