# 28 — Timeline

- **Status:** v1.0 — V2 module
- **ADR:** `docs/11_ADR/0047-timeline.md`
- **Depends on:** 27_dependencies (arrows), 07_sprints (bands),
  04_issues (dates), 22_saved_views (the shared filter)

## 1. Overview

A Gantt chart for one project: horizontal bars on a zoomable time axis,
dependency arrows between them, sprint bands behind them, and drag to
reschedule.

Scope: bars, arrows, conflicts, sprint bands, zoom, drag-move/resize, an
unscheduled tray. Not: auto-rescheduling dependents, critical path, portfolio
(cross-project) timelines, baselines.

## 2. Business Rules

| # | Rule |
|---|---|
| BR-1 | `Issue.startDate` is new; `dueDate` already exists. The bar runs `startDate → dueDate`. |
| BR-2 | An issue is drawn only if it has a **due date**. Neither date = unscheduled, and unscheduled work is never given an invented position. |
| BR-3 | Due date but no start renders as a **one-day bar** on the due date — what we actually know is the deadline. |
| BR-4 | `startDate` may not be after `dueDate` (422). Checked on every write path, including a drag. |
| BR-5 | Dates snap to whole days. A Gantt with times on it implies a precision nobody is planning to. |
| BR-6 | An **Epic with no dates of its own** spans `min(child start) … max(child due)` and is **read-only** — dragging a computed number is a control that cannot do what it looks like. An Epic with its own dates uses them and drags normally. |
| BR-7 | Arrows are `BLOCKS` links (ADR-0046). No new storage; the link table is the source. |
| BR-8 | A `BLOCKS` link whose **blocker's due date is after the dependent's start** is a **scheduling conflict**: drawn red, counted in the header. A warning, never a refusal — a plan being wrong is information. |
| BR-9 | Sprints with dates are drawn as bands behind the bars (ADR-0014). |
| BR-10 | At most **200 bars**, chosen by **soonest due date** — a rule that is total (every drawn row has a due date) and statable ("the next 200 things due"). Deliberately not "earliest start": the chart *displays* by effective start (`startDate ?? dueDate`), which SQL cannot order by without COALESCE, so selecting on start would make the database's 200 a different set from the one displayed and silently drop rows the chart had decided to draw. The UI says when it truncated. |
| BR-11 | Rescheduling is version-checked (ADR-0011) and needs the same write access as any issue edit. Moving an issue **never** moves anything else (ADR-0047 §7). |
| BR-12 | The unscheduled tray lists undated issues, capped at 50. Scheduling one uses **date inputs plus a one-click "This week"**, not drag-from-tray-onto-axis: that gesture needs edge auto-scroll, a drop preview and a separate keyboard path, and none of it is faster than typing a date. Drag-from-tray is a tracked refinement (backlog TL-3), not a claim. |
| BR-13 | A bar is never drawn narrower than **30px**, whatever the zoom's pixels-per-day says, and resize handles are on **every** draggable bar regardless of width. A one-day bar (BR-3, the shape of most real data) is 14px at Week and 4.5px at Month — unclickable, and with nowhere to put handles, so the only gesture that can turn it into a multi-day bar is unavailable exactly where it is needed. At Month zoom this overstates a one-day bar's width; the row and the tooltip carry the real dates. See ADR-0047 §9. |
| BR-14 | When there are rows but no `BLOCKS` links among them, the view says arrows come from Blocks links rather than showing nothing. No arrows and broken arrows look the same on screen. |

## 3. Database

```prisma
model Issue {
  // …existing…
  /// Timeline bar start (ADR-0047 §1). `dueDate` is the other end.
  startDate DateTime?
  @@index([projectId, startDate])
}
```

One column. Arrows, conflicts and sprint bands all read tables that exist.

## 4. API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/projects/{id}/timeline` | Bars, unscheduled issues, sprint bands, links, conflicts — one response. |
| `PATCH` | `/api/issues/{id}/schedule` | Set `startDate` / `dueDate`. Version-checked. |

`GET` takes the shared `IssueFilter` query string, so the timeline narrows with
the same controls as every other list.

## 5. UI

Route `/projects/{id}/timeline`, a tab beside Board and Backlog.

- **Axis** — zoom Day / Week / Month; today marked with a vertical line;
  month and day headers appropriate to the zoom.
- **Rows** — key, type icon and title on a fixed left rail; the bar on the
  scrolling right.
- **Bars** — solid for explicit dates, outlined for a rolled-up Epic (BR-6),
  struck-through when Done. Drag the body to shift, the edges to resize; the
  edge handles are always present and always at least 8px of grab area, on a
  bar that is always at least 30px wide (BR-13).
- **Arrows** — SVG overlay from blocker's right edge to dependent's left;
  **red when the plan is impossible** (BR-8), with the count in the header. When
  there are none, a line says where they come from (BR-14).
- **Sprint bands** — shaded, named, behind everything.
- **Unscheduled tray** — a panel of undated issues, each with start/due inputs,
  a **Schedule** button and a one-click **This week**. Keyboard-operable, and
  testable without a browser.
- **Truncation notice** — when the cap bites, say so and point at the filter.

## 6. Acceptance Criteria

1. An issue with a start and due date renders a bar of the right length at the
   right offset for all three zoom levels.
2. An issue with only a due date renders as a one-day bar on that day.
3. An issue with no dates does not appear on the axis but does appear in the
   tray, and scheduling it from there moves it onto the chart.
4. An Epic with no dates spans its children and cannot be dragged.
5. `A blocks B` draws an arrow; when A's due date is after B's start, it is red
   and the header counts one conflict.
6. Dragging a bar persists both dates, snapped to whole days, and survives
   reload; a stale version is a 409.
7. `startDate` after `dueDate` is a 422 on every path.
8. Sprint bands appear at their real dates.
9. A project over the cap renders 200 bars and says it truncated.
10. A one-day bar is grabbable and resizable at **every** zoom: at Day, Week and
    Month it is at least 30px wide and carries both edge handles, and dragging
    its left edge sets a `startDate` where there was none.

## 7. Validation

`scheduleIssueSchema` — `startDate` / `dueDate` nullable ISO dates,
`expectedVersion`; refuses `startDate > dueDate`.

## 8. Future Scope

Auto-reschedule dependents on a drag (with consent + undo — backlog TL-2),
critical path, cross-project portfolio timeline, baselines ("what we said in
January"), milestones as a first-class entity, export to image, and
dependency-aware sprint warnings.
