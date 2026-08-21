# 29 — Calendar

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0048-calendar.md`
- **Depends on:** 28_timeline (the dates and the write path), 04_issues,
  22_saved_views (the shared filter)

## 1. Overview

A month and week calendar for one project: issues as bars on the days they
occupy, drag to reschedule, and a panel of undated work to drop onto a day.

Scope: month grid, week grid, multi-day bars, overflow, drag-to-reschedule,
drag-from-panel, the shared filter. Not: a day view, resizing, calendar sync,
recurring issues.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | An issue appears only if it has a **due date** (28_timeline BR-2). No due date = it belongs in the unscheduled panel, never on a guessed day. |
| BR-2 | Due date with no start is a **one-day** event on the due date (28_timeline BR-3). The same `spanOf` both views use — one definition, in `shared/lib/day.ts`. |
| BR-3 | An issue spanning several days is **one bar**, not a copy per day. Across a week boundary it becomes one segment per week row, each marked so the reader can see it continues. |
| BR-4 | Within a week row, overlapping bars take **distinct lanes**, assigned earliest-start-first then longest-first, so a long bar does not get stranded under short ones. Lanes are stable for a given set of events — the grid must not reshuffle on an unrelated re-render. |
| BR-5 | A day cell shows up to **12 bars** in month view (**30** in week view), and each week row **sizes itself to what it actually holds** — the grid grows and the page scrolls rather than the month staying one screen tall and hiding work to manage it. Beyond the cap the rest collapse into **"+N more"**, which opens that day and lists it **in full**. The cap exists only because a cell must be bounded somewhere; it is a door, not a wall. See ADR-0048 §12. |
| BR-6 | Dragging a bar to another day **moves the whole span**, preserving duration (ADR-0048 §5). Resizing is not offered here. |
| BR-7 | Dropping an issue from the unscheduled panel onto a day sets **`dueDate` = that day**, leaving `startDate` null — a one-day event. The person said when it is due, not how long it takes. |
| BR-8 | Every write goes through `PATCH /api/issues/{id}/schedule` (ADR-0048 §7), so version checks (ADR-0011), RBAC, the archived-project refusal and BR-4 of 28_timeline all apply unchanged. |
| BR-9 | Reading needs only same-organization; a project in another org is a **404**, never a 403 (F-1). Writing needs MEMBER or LEAD on the project, or org ADMIN (ADR-0024), enforced **server-side**. |
| BR-10 | Weeks start **Monday**, consistently with the Timeline's week ticks. |
| BR-11 | All day arithmetic is **UTC**. A day is a day; local time puts an issue due the 14th into the 13th's cell for half the org. |
| BR-12 | At most **500 events** in the visible window. Beyond that the view says it truncated and points at the filter, rather than quietly showing a subset. |
| BR-13 | A rolled-up Epic is **not** drawn. The Timeline computes an epic's span from its children because a Gantt is about hierarchy; a calendar is about what lands on a day, and a derived six-week band across every cell is noise. Epics with their own dates appear normally. |
| BR-14 | Clicking a bar opens the issue; **dragging one never does** (28_timeline BR-15, same rule, same reason). |
| BR-15 | A bar is a **tinted pill with a 3px leading accent and foreground text**, with a gutter each side so the cell borders stay visible — never a saturated block with white text, which turns a dense month into unreadable stripes. Only HIGHEST and HIGH priority carry a dot. See ADR-0048 §11. |
| BR-16 | The calendar opens on the **whole project's open work** (`openOnly`), never on a narrowed scope. It briefly defaulted to assigned-to-me to thin out a crowded month; that reads as an app losing data and was reverted. Density is solved in the layout (BR-5), not by quietly changing what the page is about. `openOnly` stays because a month of finished work is the archive, and it is written on the filter bar, one click from off. See ADR-0048 §12. |

## 3. Database

None. The Calendar reads `Issue.startDate` and `Issue.dueDate`, added by
ADR-0047, and writes them through the Timeline's endpoint.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/{id}/calendar` | Events in a window, plus the unscheduled panel. |
| `PATCH` | `/api/issues/{id}/schedule` | **Existing** (28_timeline §4). Every calendar write uses it. |

`GET` takes `from` and `to` (`YYYY-MM-DD`, inclusive) plus the shared
`IssueFilter` query string, so the calendar narrows with the same controls as
every other view.

## 5. UI

Route `/projects/{id}/calendar`, a tab beside Timeline.

- **Header** — month/week title, `‹` `›` navigation, a **Today** button, and a
  Month / Week switcher.
- **Month grid** — seven columns from Monday; six week rows; days outside the
  month dimmed; weekends tinted; today's date in a filled accent pill.
- **Bars** — rounded, status-coloured, with a priority dot, the issue key and
  title; continuation arrows when a bar is cut by a week boundary; struck
  through when Done.
- **Overflow** — "+N more" opens a popover listing that day in full.
- **Unscheduled panel** — a **sidebar beside the grid**, not below it: a
  six-week month is taller than a laptop viewport, and a drop target you have to
  scroll to mid-drag is not a drop target. Undated issues, draggable onto any
  day, each with a keyboard-operable date input beside the grip — a drag-only
  control is unusable without a mouse.
- **Drop feedback** — the target cell highlights while a drag is over it.
- **Truncation notice** — when the cap bites, say so and point at the filter.

## 6. Acceptance Criteria

1. An issue with a due date and no start renders as a one-day bar in that day's
   cell, in both month and week view.
2. An issue spanning five days renders as ONE bar covering five columns, not
   five bars.
3. An issue spanning a week boundary renders as one segment per week row, each
   marked as continuing.
4. Two overlapping issues occupy different lanes and never draw on top of each
   other.
5. A day with more issues than the cap shows exactly the cap plus a "+N more"
   that opens the rest, and only the crowded day says so — a busy Wednesday must
   not put "+2 more" on an empty Friday.
6. Dragging a three-day bar onto a new day moves both dates and preserves the
   three-day duration; it survives reload.
7. Dropping an issue from the unscheduled panel onto a day sets its due date to
   that day and removes it from the panel.
8. Clicking a bar opens the issue; a drag never does.
9. A VIEWER (and a non-member of the same org) sees the calendar and cannot
   drag anything; the API refuses their schedule call with 403.
10. A project in another organization is a 404.
11. An archived project is read-only (409), and a stale version is a 409.
12. Month navigation moves by whole months — 31 January plus one month is 28
    February, not 3 March — and Today returns to the current one.
13. The calendar opens on the whole project's open work; the filter bar shows
    "Open (not done)" and one click clears it.
14. Every issue the API returns for the window is either drawn on the grid or
    counted in a "+N more" — and opening that day lists it in full. Nothing is
    unreachable.

## 7. Validation

`calendarWindowSchema` — `from` / `to` as `YYYY-MM-DD`, `to` on or after
`from`, and a window no wider than 62 days (a six-week month view plus slack;
wider is a report, not a calendar).

Writes reuse `scheduleIssueSchema` (28_timeline §7) unchanged.

## 8. Future Scope

Day view, drag-to-resize, configurable week start, showing sprints as all-day
banners, Google/Outlook sync, an iCal subscription feed, recurring issues, and
a personal cross-project calendar ("everything assigned to me").
