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
| BR-5 | **Weeks of work** = `remainingMinutes ÷ WEEKLY_CAPACITY_MINUTES` (2400 = 8 h × 5 d), a code constant, not a stored field (ADR-0034). |
| BR-6 | **Status bands:** `IDLE` (no open issues) · `LIGHT` (< 0.5 weeks) · `BALANCED` (0.5–2 weeks) · `OVERLOADED` (> 2 weeks). |
| BR-7 | **Scope = one team's direct members.** Selecting a parent team does not roll up descendants; each descendant team is separately selectable. |
| BR-8 | **Who may look** (server-side, service layer): a manager may inspect any team they manage plus all its descendants (ADR-0032); an org admin holding `MANAGE_TEAMS` may inspect any team in the organization. Everyone else has an empty scope and sees the empty state. |
| BR-9 | **Tenant isolation (F-1).** A `teamId` outside the caller's organization — or outside their scope — resolves to `NotFoundError`, never a leak. |
| BR-10 | Rows sort by remaining effort descending, so the most loaded person is first; ties break by name. |
| BR-12 | With no `teamId` given, the view opens on the **largest team in scope** (most direct members). An org chart carries thin parent teams ("Engineering · 1 person"); landing on one because it sorts first alphabetically wastes the first screen. The picker itself stays alphabetical for scanning. |
| BR-11 | The person drill-in lists that person's open issues (key, title, project, status, priority, remaining), most-remaining first, capped at 50, and is subject to the same scope check as the summary. |

## 3. Database

**No schema change.** Workload reads existing tables only:
`Team`, `TeamMembership`, `User`, `Issue` (`assigneeId`, `status`,
`estimateMinutes`), `WorkLog` (`minutes`), `Project` (`organizationId`).

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
  }
}
```

## 5. UI

Route `/workload`, reached from the sidebar (shown to team managers and org
admins — a convenience; the boundary is server-side).

- **Team picker** — the teams in scope, with member counts.
- **Summary strip** — people, open issues, total remaining, overloaded count,
  idle count.
- **Person rows** — avatar, name, team-relative bar (full bar = 2 weeks, the
  rebalancing line), weeks of work, open-issue count, and an `N unestimated`
  chip when estimates are missing. Status is conveyed by a coloured band **and**
  a text label, never colour alone (accessibility).
- **Drill-in** — expanding a row loads that person's open issues, each linking
  to the issue detail page where it can be reassigned.
- **Empty states** — no scope ("You don't manage a team yet"), empty team, and
  a team where nobody has open work.

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

## 7. Validation

`teamId` and `userId` are `cuid`-shaped strings validated by Zod at the route
boundary; scope is re-checked in the service for every request (never trusted
from the client).

## 8. Future Scope

- Per-person capacity (part-time, leave calendar) — replaces the constant in
  BR-5 without touching the aggregation. Logged in the backlog.
- Optional roll-up of descendant teams behind an explicit toggle.
- Forecasting ("when will this team be clear?") once velocity lands.
- Drag-to-reassign directly from the workload row.
- SQL-side aggregation if team sizes outgrow application-side grouping.
