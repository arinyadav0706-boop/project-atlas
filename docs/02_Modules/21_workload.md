# 21 — Workload

**Version:** 1.0 · **Status:** Implemented (V2 Epic 3) · **ADR:** ADR-0034
(model), ADR-0032 (manager visibility), ADR-0030 (time tracking)

## 1. Overview

Workload answers one question for a manager: **who on my team is overloaded,
and who has room?** It joins the two axes EAGLES already models — the people
axis (`Team`/`TeamMembership`) and the effort axis (`Issue.estimateMinutes` +
`WorkLog`) — and reports, for every direct member of a chosen team, how much
unfinished work is queued against them **across every project**.

It is deliberately read-only. Rebalancing happens by reassigning an issue in
the existing Issues/Board UI; Workload is the instrument, not the lever.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | **Load = remaining effort.** For each open issue assigned to the person, `remaining = max(estimateMinutes − loggedMinutes, 0)`; the person's load is the sum. Logged work is behind them, not ahead. |
| BR-2 | **Open** means `status ≠ DONE` and `deletedAt IS NULL`, in a live (non-deleted) project of the caller's organization. Done work never counts as load. |
| BR-3 | **Cross-project by construction.** Every project in the organization is included; there is no project filter. A person's load is the sum of what they owe everywhere. |
| BR-4 | **Unestimated work is counted, never guessed.** An open issue with no estimate increments `openIssues` and `unestimated`, and contributes **0** to remaining effort. No default estimate is ever imputed. |
| BR-5 | **Weeks of work** = `remainingMinutes ÷ weeklyCapacity`, where `weeklyCapacity = Organization.workingMinutesPerDay × Organization.workingDaysPerWeek` (default 8 h × 5 d = 40 h). Set per organization in Admin → Organization (ADR-0034 amendment); a 6-day company gets 6-day weeks. Every view states the basis it used. |
| BR-6 | **Status bands:** `IDLE` (no open issues) · `LIGHT` (< 0.5 weeks) · `BALANCED` (0.5–2 weeks) · `OVERLOADED` (> 2 weeks). |
| BR-7 | **Scope = one team's direct members.** Selecting a parent team does not roll up descendants; each descendant team is separately selectable. |
| BR-8 | **Who may look** (server-side, service layer): a manager may inspect any team they manage plus all its descendants (ADR-0032); an org admin holding `MANAGE_TEAMS` may inspect any team in the organization. Everyone else has an empty scope and sees the empty state. |
| BR-9 | **Tenant isolation (F-1).** A `teamId` outside the caller's organization — or outside their scope — resolves to `NotFoundError`, never a leak. |
| BR-10 | Rows sort by remaining effort descending, so the most loaded person is first; ties break by name. |
| BR-12 | With no `teamId` given, the view opens on the **largest team in scope** (most direct members). An org chart carries thin parent teams ("Engineering · 1 person"); landing on one because it sorts first alphabetically wastes the first screen. The picker itself stays alphabetical for scanning. |
| BR-11 | The person drill-in lists that person's open issues (key, title, project, status, priority, remaining), most-remaining first, capped at 50, and is subject to the same scope check as the summary. |
| BR-13 | **Time phasing (ADR-0035).** Each open issue's remaining effort is placed in time by the scheduling chain, first match wins: (1) the issue's own `startDate`+`dueDate` — *dormant, the column does not exist yet (WL-4)*; (2) `dueDate` alone → spread from **today** to the due date; (3) the issue's sprint `startDate`+`endDate`; (4) none of these → **Unscheduled**. A window is clamped to today, and a window whose end has already passed becomes **Overdue** — that covers both a missed due date and work still open in a sprint that has ended. Effort divides evenly across the **working days** of the window (BR-5's week), then sums into UTC Monday-start week buckets. |
| BR-14 | **The grid never invents or drops effort.** A person's Overdue + four week columns + Later + Unscheduled always sums exactly to the `remainingMinutes` the list view shows for them. `Later` exists precisely to hold effort spreading beyond the fourth week, so the horizon cannot silently swallow it. |
| BR-15 | **Inference is visible.** Effort placed from *sprint* dates rather than the issue's own is marked in the UI (`S`), because a manager must be able to tell a real date from a guess. |

## 3. Database

Workload adds two columns to `Organization` (ADR-0034 amendment, migration
`20260805210000_org_working_week`, additive with defaults):
`workingMinutesPerDay` (default 480) and `workingDaysPerWeek` (default 5).

Otherwise it reads existing tables only:
`Team`, `TeamMembership`, `User`, `Issue` (`assigneeId`, `status`,
`estimateMinutes`, `dueDate`), `WorkLog` (`minutes`), `Project`
(`organizationId`), and `Sprint` (`startDate`, `endDate`) through the issue's
sprint relation.

**The time-phased grid adds no schema at all** (ADR-0035). It reads the dates
the team already keeps. `Issue.startDate` is deliberately *not* introduced —
it stays as backlog **WL-4**, owned by the Gantt/Timeline module, which unlike
workload cannot function without it.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/workload?teamId=<id>` | Scope (selectable teams) + the selected team's rows and totals. `teamId` omitted → the largest team in scope (BR-12). |
| `GET` | `/api/workload/users/{userId}` | That person's open issues (drill-in), scope-checked. |

`WorkloadDto`:

```jsonc
{
  "teams":  [{ "id": "…", "name": "Payments Squad", "memberCount": 8 }],
  "selectedTeamId": "…",
  "rows": [{
    "userId": "…", "name": "…", "email": "…", "avatarUrl": null,
    "openIssues": 12, "unestimated": 4,
    "remainingMinutes": 3600, "estimatedMinutes": 4800, "loggedMinutes": 1200,
    "weeksOfWork": 1.5, "status": "BALANCED"
  }],
  "totals": {
    "people": 8, "openIssues": 91, "unestimated": 30,
    "remainingMinutes": 28800, "overloaded": 2, "idle": 1
  },

  // The same effort as `rows`, redistributed across weeks (BR-13, ADR-0035).
  // One service call feeds both views, so they cannot disagree.
  "grid": {
    "weeks": [{ "start": "2026-08-03T00:00:00.000Z", "label": "Aug 3–7", "isCurrent": true }],
    "rows": [{
      "userId": "…", "name": "…", "avatarUrl": null,
      "overdue": { "minutes": 360, "percentOfCapacity": 15, "inferred": false },
      "weeks":  [{ "minutes": 1920, "percentOfCapacity": 80, "inferred": true }],
      "later":  { "minutes": 0, "percentOfCapacity": 0, "inferred": false },
      "unscheduledMinutes": 1500,
      "totalMinutes": 3780          // === rows[].remainingMinutes (BR-14)
    }],
    "hasOverdue": true,             // column shown only when non-empty
    "hasLater": false,
    "hasInferred": true,            // any cell placed from sprint dates
    "weeklyCapacityMinutes": 2400
  }
}
```

## 5. UI

Route `/workload`, reached from the sidebar (shown to team managers and org
admins — a convenience; the boundary is server-side).

- **Team picker** — the teams in scope, with member counts.
- **Summary strip** — people, open issues, total remaining, overloaded count.
- **Team mix** — one horizontal stacked bar of how many people sit in each
  status band, with counts in the legend. The shape of the team in one glance,
  before any individual name.
- **Weeks queued per person** — a horizontal bar chart, one bar per person on a
  shared zero-based axis in weeks, most loaded at the top, coloured by status
  band, with dashed reference lines at the **0.5** and **2** week band edges
  (BR-6) and each bar captioned `remaining · N issues` — or `no open work`,
  because a zero-length bar must not read as missing data. This is what makes
  two people comparable: the CSS mini-bars it replaced were scaled to a fixed
  2-week width with no ticks, so "how full is this" was unanswerable and people
  in different status groups could not be compared at all (backlog UI-2).
- **Grouped rows** — beneath the chart, people are grouped under status headings
  (Overloaded → Balanced → Has room → No open work) with a count each. Status is
  carried by the heading (text **and** colour, never colour alone), and the
  colours are the same tones the charts use, so a status is never one colour
  above and a different one below.
- **Person rows** — avatar, name, and two figures: weeks queued, and
  `remaining · N issues` beneath it. The row carries no load bar of its own;
  that job belongs to the chart, and duplicating it only added density.
- **Basis footnote** — "Based on a 8h × 5 days = 40h week", so no figure on the
  page is unexplained (BR-5).
- **Drill-in** — expanding a row loads that person's open issues, each linking
  to the issue detail page where it can be reassigned.
- **Empty states** — no scope ("You don't manage a team yet"), empty team, and
  a team where nobody has open work.

### 5.1 The "By week" grid (ADR-0035)

A **By person / By week** toggle sits beside the team picker. "By person" (the
list above) stays the default and answers *who is overloaded*; "By week" answers
*when*. Both render from the same response.

- **Columns** — `Overdue` · four week columns · `Later` · `Unscheduled`.
  Overdue and Later appear only when they carry something, so the grid reflows
  rather than showing a permanently empty red column.
- **Headers are real dates** — `Aug 3–7`, with "this week" marked. Never
  `+2 wk`: a manager should recognise the week from their own calendar instead
  of counting forward.
- **Cells show hours *and* percentage.** The hours are the magnitude, the
  percentage of that person's weekly capacity is the pressure, and the
  background is a single-hue opacity ramp of that same percentage. Over 100%
  additionally gets a ring and destructive-coloured text — never colour alone.
- **`S` marker** — the cell's effort was placed from the issue's *sprint* dates
  rather than its own due date (BR-15), with a legend beneath the grid.
- **Unscheduled shows a plain number, not a percentage** — there is no time
  period for it to be a percentage of.
- **Sticky first column, horizontal scroll inside the grid's own container**,
  never the page.
- Rendered as a semantic `<table>`, not an ECharts canvas — see ADR-0035 §7 for
  why this is a deliberate exception to ADR-0036.
- **Basis footnote** — how the placement works, in one sentence, stating it is
  demand by due date and not a plan.

## 6. Acceptance Criteria

1. A manager of a team sees exactly its direct members, sorted most-loaded first.
2. A person with 3 open issues estimated 8 h total and 2 h logged shows
   remaining 6 h → 0.15 weeks → `LIGHT`.
3. An issue moved to `DONE` leaves the person's load immediately.
4. An issue with no estimate raises `openIssues` and `unestimated` but not
   remaining effort.
5. Logged time exceeding the estimate contributes 0, never a negative.
6. A manager requesting a team they don't manage receives 404.
7. An org admin sees every team in the organization in the picker.
8. A user in another organization requesting the same `teamId` receives 404.
9. A person assigned work in three projects shows the combined total.
10. The drill-in lists only that person's open issues, most-remaining first.
11. An issue estimated 20 h due three weeks out appears spread across the
    intervening week columns, not lumped into the third (BR-13 rule 2).
12. An issue with no due date, in a sprint ending next week, lands in next
    week's column and is marked `S` (BR-13 rule 3, BR-15).
13. An issue with both a due date and a sprint is placed by its **due date**,
    and is not marked `S`.
14. An issue whose due date has passed appears in `Overdue`; so does an issue
    still open in a sprint that ended.
15. An issue with neither a due date nor a sprint appears in `Unscheduled`.
16. Every grid row's columns sum exactly to that person's `remainingMinutes`
    in the list view, including when work spreads past the horizon (BR-14).
17. A team with nothing overdue sees no `Overdue` column.
18. The grid lists people in the same order as the list view.

## 7. Validation

`teamId` and `userId` are validated by Zod at the route boundary as **opaque
bounded strings** (1–64 chars) — deliberately *not* `.cuid()`, which would
reject seeded and migrated ids that EAGLES did not mint itself. Id format is
not a security control here: scope and tenant are re-checked in the service on
every request, and an unknown id 404s.

Org working-week settings are validated in `admin.schemas.ts`:
`workingHoursPerDay` 1–24 and `workingDaysPerWeek` an integer 1–7, so a typo
cannot make every capacity figure meaningless.

## 8. Future Scope

- Per-person capacity (part-time, leave calendar) — refines BR-5's org-wide
  week without touching the aggregation. Backlog WL-1.
- `Issue.startDate`, which activates rule 1 of the scheduling chain and lets
  effort spread across an explicit range. Backlog **WL-4**, owned by the
  Gantt/Timeline module.
- Clicking a grid cell to list the issues behind it, under the BR-11 scope
  check. Backlog **WL-5**.
- A configurable date source, as Jira's plan settings offer — the chain is
  already an ordered list, so this is configuration rather than a rewrite.
- Due date as a *deadline constraint*: warn when sprint-derived scheduling
  pushes work past its due date (Jira does this).
- Optional roll-up of descendant teams behind an explicit toggle.
- Forecasting ("when will this team be clear?") once velocity lands.
- Drag-to-reassign directly from the workload row.
- SQL-side aggregation if team sizes outgrow application-side grouping.
