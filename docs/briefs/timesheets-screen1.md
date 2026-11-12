# Claude Code brief: Timesheets, Screen 1 "My Timesheet"

You are working in the EAGLES repo (project-atlas). Follow `CLAUDE.md` strictly:
docs before code, no invented tables/APIs without a doc change and my approval,
feature-first folders, repository pattern, server-side RBAC, Zod, audit fields,
log every deferral in `docs/10_Roadmap/02_Backlog_and_Tech_Debt.md`.

Approved mockups are saved in `docs/05_UI/mockups/timesheets/`:
- `my-timesheet-states-a.png`: draft week, add-activity picker, returned,
  submitted, empty week. Ignore its mobile frame and its notes/components
  panel.
- `my-timesheet-states-b.png`: notes/overtime/pinned rows, submit blocked,
  approved/locked, no-HR-integration hint.
The data in the mockups is sample data; real values come from the database.

Order of work: build and test ALL the functionality first (Steps 1–3), then
make the screen match the mockups exactly (Step 4). Desktop web only, no
mobile layout.

---

## 1. Product decisions already made (do not re-open them)

- Eagles is becoming a commercial SaaS for tech companies and startups (IT
  services, agencies, AI startups, product companies). `CLAUDE.md` and
  `docs/00_Product` still describe an internal tool for one 500-person org:
  flag this in your Step 1 summary and propose doc updates, but don't change
  those docs without my approval.
- Order of work: all timesheet features first, then a full UI makeover later.
- Time is logged weekly. Every entry points to EITHER an issue OR an
  org-defined activity (meetings, HR activities, client meetings, preparation,
  drafting… unlimited, grouped in categories). An activity entry may be tagged
  to a project and/or client; an activity can require that.
- Billable flag on every entry. Resolution: entry override → issue/activity
  default → project default → client default. Employees never see money.
- Lifecycle: Draft → Submitted → Approved (one or more approvers) → Locked;
  approvers can Return specific lines with a reason. Invoiced is future scope.
- Approvers: reporting manager, functional manager, project manager. Which
  ones an org uses, the order, and who sees whose hours are admin settings
  (admin screen comes later; ship sensible defaults now). The reporting
  manager can reuse the existing team manager (ADR-0032).
- All timesheet rules are per-org admin settings with defaults: week start
  day, due day/time (default Monday 11:00 for the previous week), reminders,
  lock rules, overtime threshold, notes-required rules, whether employees may
  override billable. A policy change applies from the next period only and is
  audited, so submitted/approved data never changes.
- Leave and holidays will come from HROne (integration is a later screen).
  Until an org has it connected, expected hours ignore leave/holidays and the
  screen shows a hint saying so.
- Multi-currency from day one, no tax, no conversion (not needed on this screen).
- No invoicing, no accounting export, no client portal for now.

## 2. What exists today (read before designing)

- `docs/02_Modules/19_time_tracking.md`, ADR-0030: `WorkLog` with required
  `issueId`, minutes, workDate, note, author-only edit, soft delete, audit.
- ADR-0034 (working week on Organization), ADR-0032 (manager visibility),
  ADR-0056 (time reporting, proposed).
- `docs/05_UI/*`, especially `07_Migration_Plan.md` (V2 UI behind
  `FEATURE_UI_V2`). Build this screen in the V2 style.

## 3. Step 1: docs and design only, then STOP for my approval

Write:
1. `docs/11_ADR/0059-timesheets-and-activities.md` covering the data model,
   the lifecycle and the migration of existing `WorkLog` rows.
2. `docs/02_Modules/37_timesheets.md` (full module template) and an update to
   `19_time_tracking.md`.
3. Additions to `docs/03_Database/` and `docs/04_API/openapi.yaml`.
4. Backlog entries for everything deferred.

Starting proposal for the model (refine it, and justify changes in the ADR):
- `ActivityCategory`, `Activity` (org-scoped; defaults: billable,
  requiresProject, requiresClient, notesRequired, visible to teams, archived).
- `Client` (org-scoped, minimal now: name, currency); `Project.clientId?`,
  `Project.currency`, `Project.defaultBillable`.
- `WorkLog`: `issueId` becomes optional, add `activityId?` with a DB check
  that exactly one is set; `projectId?`/`clientId?` for activity entries;
  `billable`, `billableOverridden`; `timesheetId`; per-line
  `returnedReason?`.
- `Timesheet` (user, periodStart, periodEnd, status, submittedAt, lockedAt,
  version) and `TimesheetApproval` (approver, relation type
  REPORTING | FUNCTIONAL | PROJECT, status, decidedAt, comment).
- `TimesheetRow` (persists rows added with no hours yet, plus their position)
  and `PinnedTimesheetRow` (recurring rows per user).
- `TimesheetPolicy` (org settings above, effective-dated).
- `Holiday`, `EmployeeLeave` (filled by the HR integration later) and an
  org flag for whether HR is connected.

List every open question in the ADR instead of guessing, e.g. how a
functional manager is stored, and whether project-manager approval covers only
that project's lines.

## 4. Step 2: backend (after approval)

Services and repositories in `src/features/timesheets/`, plus API routes per
openapi. Business rules:
- Durations accept "1:30", "1.5", "1h 30m", "90m"; stored as integer minutes.
- Autosave per cell. OCC on edits.
- Expected minutes per day = org working day, minus holidays and approved leave
  (only when HR is connected).
- Overtime flag when a day's total exceeds the policy threshold.
- Submit is blocked, with a list of problems each pointing to its cell/row,
  when: a required note is missing, an activity lacks a required
  project/client, a day exceeds 24h, or the week is empty.
- Draft: editable. Submitted: read-only, approvers with status. Returned:
  only returned lines editable, reason shown, resubmit. Approved/Locked:
  read-only, approvers with date/time, approval history.
- Copy last week copies rows, not hours. Pinned rows appear every week;
  "Manage recurring" edits them.
- Add row: issue search (suggest issues assigned to me or worked this week);
  activity picker (search, categories, favourites, recents).
- RBAC: a user edits only their own timesheet; locked weeks are immutable;
  everything is audited.

Row actions (all in scope): Edit, Pin/Unpin (recurring), Duplicate (copies
the row's work item and tags to a new row, not the hours), Move up / Move
down (row order persists per timesheet), Remove.

## 5. Step 3: functional screen

Route under the app shell (e.g. `/timesheets`), with a nav item. Wire every
function to the backend with plain existing components first:
- Week header: navigation, This Week, week picker, status, approvers,
  deadline.
- Summary: logged vs expected, billable / non-billable.
- Grid: rows; day columns with leave / holiday / weekend states; totals; note
  indicator; required-note flag; billable marker click-to-toggle; overtime
  flag; pin indicator; row menu.
- Footer: Add row, Copy last week, Manage recurring, autosave status, Submit.
- Other states: submit-blocked panel with "Go to cell / Go to row", returned
  banner, approved / locked view with "View approval history", and the
  "HR not connected" hint with its "Integrate HR" link.

Out of scope here: the running timer (Screen 2 builds it, so leave the top-bar
slot), the admin settings screens, HROne sync, and reports.

## 6. Step 4: match the mockups exactly

Once Step 3 works and its tests pass, make the screen match the approved
mockups as exactly as possible: layout, spacing, components, colours, type
sizes and weights, icons (lucide), chips, rounded corners, and every state.
Compare your running screen side by side with the mockups and fix every
difference.

Style rules:
- **Borders, not shadows.** Separate cards, panels, the grid and its columns
  with subtle 1px borders (`#E5E7EB`). No drop shadows on cards or columns.
  Light theme only: no dark mode work.
- **Glass only on floating layers.** Frosted translucency (semi-transparent
  surface + backdrop blur) only on floating layers: the sticky top / nav
  header, the command menu, the notification drawer, and popovers / pickers
  such as Add activity. Never on the grid or other content, and text on glass
  must keep WCAG AA contrast.
- **Colours through tokens.** Add any colour the mockups need (e.g. the
  `#E5E7EB` border, a glass surface) as a token in `globals.css` /
  `tailwind.config.ts`, never as a hex value in components. Add new tokens
  rather than re-valuing existing ones, so other screens don't change; the
  full UI makeover later will unify them.
- **Reuse before building.** Extend the primitives in
  `src/shared/components/ui` and add a new primitive only when nothing
  existing fits. Document any new primitive.

## 7. Step 5: tests and wrap-up

- Unit: duration parsing, billable resolution, expected hours, overtime,
  submit validation.
- Integration: submit → approve → lock; submit → return → resubmit; RBAC;
  immutability after lock.
- Playwright E2E for the main flow.
- Update the module doc's acceptance criteria and the backlog; conventional
  commits referencing `37_timesheets.md`.
