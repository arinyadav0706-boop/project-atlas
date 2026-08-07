# 01 — Metric Definitions (the calculation reference)

**The single source of truth for how every number in EAGLES is calculated.**
If a figure appears on a screen, in a report, or in an export, its definition
lives here — in plain English *and* as an exact formula, with the inputs it
reads and the cases it excludes.

## Why this document exists

Two people looking at "velocity 34" must mean the same thing, and a client
asking "how did you get that?" must get one answer, not three. Reports are also
the easiest place in a product to be quietly wrong: a metric that silently
excludes a row, or averages away an empty sample, is worse than no metric —
people make staffing and delivery decisions on these numbers.

## Rules (non-negotiable)

1. **Define before you build.** A new metric gets an entry here *first*, in the
   same change as (or before) its code. No metric ships undefined.
2. **One definition, one implementation.** If two screens show "remaining
   work", they call the same function. Duplicated arithmetic is a defect.
3. **Never impute.** Missing data is reported as missing (`null`, or a separate
   "unestimated" count) — never silently replaced with 0, an average, or a
   guess presented as fact.
4. **Empty sample ⇒ `null`, not `0`.** "No completed issues yet" and "cycle
   time is zero days" are different statements. Metrics that average expose
   their `sampleSize`.
5. **State the window and the scope.** Every metric names its time window
   (or says "live") and whether it is project-scoped or organization-scoped.
6. **Deleted is invisible.** Every query filters `deletedAt IS NULL`. Soft
   deletes never appear in any metric.
7. **Tenant scope always.** Every metric is filtered to the caller's
   organization (F-1), and to what their role may see.
8. **UTC everywhere.** All bucketing, windows and day arithmetic use UTC.
   Local-time display is presentation only.

---

## Shared vocabulary

These terms mean exactly this, everywhere:

| Term | Definition |
|---|---|
| **Live issue** | `Issue.deletedAt IS NULL`, in a project with `deletedAt IS NULL`, in the caller's organization. |
| **Open issue** | A live issue whose `status ≠ DONE`. |
| **Done** | `Issue.status = 'DONE'`. EAGLES has one terminal status; there is no separate "closed/won't do" state yet. |
| **Estimate** | `Issue.estimateMinutes` — original effort in **minutes**, set by a project LEAD (ADR-0030). May be `null`. |
| **Logged** | `SUM(WorkLog.minutes)` for live work logs on the issue. Time actually spent. |
| **Remaining** | `max(estimate − logged, 0)` for an estimated issue; **0** for an unestimated one, which is counted separately. |
| **Story points** | `Issue.storyPoints` — relative size, unrelated to clock time. `null` counts as 0 in sums. |
| **Working week** | `Organization.workingMinutesPerDay × Organization.workingDaysPerWeek` — set per organization in Admin → Organization, default 8 h × 5 d = 2400 min (ADR-0034 amendment). A 6-day company's "week" is 6 days. Still org-wide, not per person (backlog WL-1). |
| **Issue types** | `EPIC`, `STORY`, `TASK`, `BUG`. Unless a metric says otherwise, **all four are included** — epics are issues too, and excluding them silently would understate counts. |

---

## Implemented metrics

### 1. Remaining work (per issue)

- **Question:** how much effort is still ahead on this issue?
- **Formula:** `remaining = estimate == null ? 0 : max(estimate − logged, 0)`
- **Inputs:** `Issue.estimateMinutes`, `SUM(WorkLog.minutes WHERE deletedAt IS NULL)`
- **Edge cases:** overrunning the estimate yields **0**, never a negative — a
  negative would silently cancel out a colleague's real load in any sum.
  Unestimated yields 0 *and* is flagged.
- **Where:** `src/features/workload/lib/capacity.ts` → `remainingMinutes()`
- **Tested:** `capacity.test.ts`

### 2. Workload (per person, per team)

- **Question:** who is overloaded, and who has room?
- **Scope:** one team's **direct members**, across **every project** in the
  organization. Live, not windowed.
- **Formulas:**
  - `remainingMinutes = Σ remaining(open issues assigned to them)`
  - `weeksOfWork = round(remainingMinutes ÷ weeklyCapacity, 1 dp)`, where
    `weeklyCapacity` is the organization's configured week
  - `unestimated = count(open issues with estimate = null)`
  - bands: `IDLE` (no open issues) · `LIGHT` (< 0.5 wk) · `BALANCED`
    (0.5–2 wk inclusive) · `OVERLOADED` (> 2 wk)
- **Excludes:** Done issues, soft-deleted issues and work logs, deactivated
  accounts, and issues in other organizations.
- **Deliberately not counted:** unestimated issues contribute **no** effort, so
  a team that does not estimate reads as light. The UI states this explicitly
  rather than inflating the number.
- **Same work, different verdict:** 100 hours queued is 2.5 weeks (Overloaded)
  at a 40-hour company and 2.1 weeks at a 48-hour one. Every view prints the
  week it used, so the number is never unexplained.
- **Where:** `src/features/workload/services/workload.service.ts`,
  `lib/capacity.ts` · **Spec:** `docs/02_Modules/21_workload.md` · **ADR-0034**
- **Tested:** `workload.service.test.ts`, `workload.integration.test.ts`

### 3. Velocity

- **Question:** how much does this project actually complete per sprint?
- **Scope:** one project; the **8 most recent COMPLETED sprints**, ordered
  oldest → newest for the chart.
- **Formula per sprint:** `points = Σ storyPoints` and `issues = count(*)` over
  issues **currently** in that sprint with `status = DONE`, `deletedAt IS NULL`.
  `storyPoints = null` contributes 0.
- **Known caveat (read before quoting it):** this is computed from the *present*
  state, not a snapshot taken when the sprint closed. Moving an issue into a
  finished sprint, or reopening one, retroactively changes history. A
  point-in-time snapshot is the fix and is planned (see below).
- **Where:** `report.repository.ts → completedSprintVelocity`,
  `report.registry.ts → velocity`

### 4. Status breakdown

- **Question:** how is this project's work distributed across statuses?
- **Scope:** one project, live, **all** issue types and **all** statuses.
- **Formula:** `count(*) GROUP BY status` over live issues; segments always
  render in the fixed order To Do → In Progress → In Review → Done, with
  absent statuses shown as 0.
- **Note:** this **includes Done**, so the total is every live issue in the
  project, not just open work.
- **Where:** `report.repository.ts → statusBreakdown`

### 5. Cycle time

- **Question:** once we start an issue, how long until it's finished?
- **Scope:** one project; issues that reached Done within the last
  `windowDays` (default 30, clamped 1–365).
- **Formula:** for each qualifying issue, `first IN_PROGRESS → first DONE`
  transition timestamps from the audit log; duration = difference; the metric is
  the **mean**, in days, to 1 decimal place. `sampleSize` is always returned
  alongside.
- **Excludes:** issues that never entered In Progress (e.g. To Do → Done
  directly), and any issue whose Done precedes its In Progress.
- **Empty sample:** `averageDays = null` with `sampleSize = 0` — never `0`.
- **Depends on:** `AuditLog` rows with action `ISSUE_STATUS_CHANGED`. Issues
  transitioned before audit logging existed have no history and are invisible
  to this metric.
- **Where:** `report.repository.ts → cycleTimeTransitions`,
  `report.registry.ts → cycleTime`

### 6. Sprint burndown

- **Question:** how much work was still open on each day of the sprint?
- **Scope:** one sprint in one project, `startDate → min(endDate, today)`, UTC
  days inclusive. A sprint without both dates has no burndown (`null`, with a
  reason) — never a chart drawn over invented dates.
- **Cohort:** the issues **currently** in the sprint. This is the metric's one
  approximation and it is stated on the chart (ADR-0037 §1): sprint membership
  changes are not audited, so an issue added or removed mid-sprint is counted
  as if it were there all along, or not at all.
- **Unit** (viewer-selectable, default points):
  `points = storyPoints ?? 0` · `issues = 1` · `hours = estimateMinutes ?? 0`.
- **Formula:** `remaining(D) = Σ size(i) for each cohort issue i whose replayed
  status at 23:59:59.999Z on day D is not DONE`.
- **Status replay is exact, not assumed.** For issue `i` at time `T`:
  1. the `afterData.status` of the latest `ISSUE_STATUS_CHANGED` at or before `T`; else
  2. the `beforeData.status` of the **earliest** recorded transition — the true
     prior state, which is why no starting status is ever guessed; else
  3. the issue's current status (it has never changed).
- **Ideal line:** straight, `scope → 0` across the same days. A reference, not a
  target; not working-day-aware (ADR-0037 §5).
- **Honesty counters, always returned:**
  - `unsized` — cohort issues with no value for the chosen unit. The line is a
    **floor**, not a reading.
  - `untrackedDone` — issues Done *now* with no recorded DONE transition
    (they predate audit logging). Replay counts them Done from day one, which
    drags the line down; surfaced rather than absorbed.
- **Empty sample:** a sprint with no issues returns `scope = 0` and an empty
  series with a reason — never a chart of zeros presented as progress.
- **Where:** `src/features/reports/lib/burndown.ts` (pure),
  `report.repository.ts → sprintBurndownInputs`, `report.registry.ts → burndown`
- **Tested:** `burndown.test.ts` · **ADR-0037**

### 7. Time tracking totals (per issue)

- **Formulas:** `logged = Σ WorkLog.minutes` (live only);
  `remaining = max(estimate − logged, 0)`; progress is shown as
  Estimate / Logged / Remaining, never as a single percentage that would hide
  an overrun.
- **Where:** `src/features/time-tracking/` · **Spec:**
  `docs/02_Modules/19_time_tracking.md` · **ADR-0030**

---

## Planned metrics — definitions agreed up front

Not implemented. Recorded here so the arithmetic is settled before anyone
builds a chart, and so two reports never disagree.

| Metric | Definition to implement |
|---|---|
| ~~**Sprint burndown**~~ | **Implemented 2026-08-07 — see §6** (ADR-0037). Resolved by replaying `ISSUE_STATUS_CHANGED`, which turned out to be *exact* because those rows carry `beforeData` as well as `afterData`. The residual gap was sprint **membership** history, which is not audited — so v1 states its cohort on the chart, and `ISSUE_SPRINT_CHANGED` now accrues for v2. |
| **Sprint burndown v2 (true membership)** | Replay `ISSUE_SPRINT_CHANGED` so issues enter and leave the cohort on the day they actually did, and draw scope-change markers. Available once the event has accumulated over a full sprint. |
| **Velocity (point-in-time)** | Supersedes §3's caveat: capture completed points at sprint close into a snapshot row, so history stops moving. Needs a doc + schema change first. A `sprint_daily_snapshot` would serve this **and** burndown v2 at once. |
| **Throughput** | Count of issues reaching Done per UTC week. No estimates required, so it works for teams that don't estimate — the honest companion to velocity. |
| **Lead time** | `created → first DONE`, distinct from cycle time (`in progress → done`). Report the **median** as well as the mean; lead time is heavily skewed by a few long-lived issues. |
| **Aging work in progress** | For each open issue currently In Progress/In Review: days since it entered that status. Surfaces stuck work that averages hide. |
| **WIP per person** | Count of issues In Progress per person; pairs with Workload (effort) to show *spread* as well as *volume*. |
| **Sprint predictability** | `completed ÷ committed` per sprint, where "committed" is the sprint's contents at start — needs the same snapshot as burndown. |
| **Team capacity forecast** | `Σ remaining ÷ (team size × weekly capacity)` → "this team is booked for N weeks". Blocked on per-person capacity (backlog WL-1). |

---

## Adding a new metric — checklist

1. Add its entry to this file: question, scope, formula, inputs, exclusions,
   empty-sample behaviour.
2. Put the arithmetic in a **pure, unit-tested function** (like
   `capacity.ts`) — not inline in a repository or a component.
3. Add the report to the registry (`report.registry.ts`) if it is a project
   report; the API dispatches by id and the UI renders by `chartType`
   (ADR-0020).
4. Cover the edge cases in tests: empty sample, missing estimates, soft-deleted
   rows, cross-organization ids.
5. If it needs data the schema cannot answer (anything historical), say so and
   propose the schema change as a doc first — never fake it with a
   present-state approximation labelled as history.
