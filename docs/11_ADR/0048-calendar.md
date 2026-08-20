# ADR-0048 — Calendar

- **Status:** Accepted
- **Date:** 2026-08-20
- **Module:** `docs/02_Modules/29_calendar.md`
- **Supersedes / relates to:** ADR-0047 (Timeline), ADR-0011 (optimistic
  concurrency), ADR-0024 (permission engine)

## Context

The Timeline answers "how does the plan lay out over months". It does not
answer the question most people actually open a tool with: **what is due this
week**. A Gantt is a planning instrument read by leads; a calendar is an
operational one read by everybody, and ClickUp, Asana and Jira all ship both
because they are not the same view of the same data.

We already have the two dates a calendar needs — `startDate` and `dueDate`,
added for the Timeline. Nothing else is missing.

## Decision

### 1. No new storage, and the same meaning of a date as the Timeline

The Calendar reads `startDate` / `dueDate` and interprets them with the **same**
rules the Timeline uses (28_timeline BR-2/BR-3): a due date is the minimum for
an event, and a due date with no start is a one-day event on the due date.

To make that guarantee structural rather than aspirational, the day arithmetic
and `spanOf` move out of `features/timeline/lib/scale.ts` into
`shared/lib/day.ts`. Two consumers is exactly when extraction stops being
premature (rule 10) — and the alternative, a second copy of "what a date
means", would let the same issue appear on the 14th in one view and the 15th in
the other. That is the kind of divergence nobody reports as a bug; they just
stop trusting both views.

`scale.ts` keeps everything pixel-shaped (axis, zoom, bar boxes, drag
resolution) and re-exports the day helpers so no existing import moves.

### 2. Month is the view; Week is the other one; Day is not built

ClickUp offers Day / Week / Month. A Day column shows a handful of issues in a
tall empty column and says strictly less than the issue list already does, with
a filter people already know. Month and Week ship; Day is not a stub, it is a
decision (backlog CAL-2).

### 3. A multi-day issue is one bar across the days, not a dot on each

Repeating an item on every day it touches is the easy implementation and it is
wrong: it makes a three-day task look like three tasks, and a month with a
handful of long-running epics looks like a month of chaos. One continuous bar
per issue per week row, the way Google Calendar and ClickUp draw a multi-day
event.

The cost is **lane packing**: within a week row, overlapping bars must be
assigned distinct vertical lanes, and an issue spanning a week boundary must be
split into one segment per week. That is a real algorithm, so it lives in a pure
module with tests (`features/calendar/lib/grid.ts`) for the same reason the
Timeline's arithmetic does — the bugs are all off-by-one-day bugs, and chasing
one through a rendered grid costs a day.

### 4. A day cell shows at most three bars, then "+N more"

An unbounded cell destroys the grid: one busy Tuesday and every row is 400px
tall. Three is what fits at the row height a month needs, and the overflow is a
control that opens the day, not a dead label.

### 5. Dragging an event to another day MOVES the whole span

A three-day task dropped on the 20th becomes the 20th–22nd; the duration is
preserved, because a person dragging a block on a calendar is rescheduling it,
not resizing it. Resizing — changing duration — stays in the Timeline, where
edges are a real target. Calendar resize is tracked (CAL-3), not faked.

### 6. Drag from the unscheduled panel ONTO a day is supported here

The Timeline deliberately refused this (28_timeline BR-12, backlog TL-3): its
axis is continuous, so a drop needs edge auto-scroll, a drop preview and a
separate keyboard path.

A calendar does not have that problem. **A day cell is a discrete drop target**
— it has an outline, it can highlight, and the keyboard equivalent is a menu on
the cell. The gesture is cheap here and it is the single most natural thing to
do with a calendar, so it ships. Consistency with the Timeline would mean
refusing a good gesture because a different view could not have it.

### 7. Writes reuse `PATCH /api/issues/{id}/schedule`

No new write endpoint. The Calendar and the Timeline are two pictures of one
pair of dates, so they get one write path — which means version checking
(ADR-0011), the RBAC gate, the archived-project rule and the start-after-due
refusal are not re-implemented and therefore cannot disagree.

### 8. Read is org-wide; writing needs project membership

Identical to the Timeline: `resolve()` refuses a project outside the caller's
organization as a 404 (F-1), and `canWriteContent` (MEMBER / LEAD, with org
ADMIN elevated per ADR-0024) gates every write, server-side.

This matches how ClickUp and Asana scope a calendar — it inherits the container
rather than carrying its own ACL — and unlike Jira's per-plan permission list,
which is a known source of "why can't I see it" support load. The org-wide
*read* is a product-level gap (there is no private project anywhere in EAGLES),
not a calendar one.

Unlike the Timeline, this module ships with its own RBAC integration tests. The
Timeline's absence of them was flagged and is closed in the same change.

### 9. Weeks start Monday

Consistent with the Timeline's week ticks, which already treat Monday as the
week start. A per-user or per-org setting is a real request in a global org and
is tracked (CAL-4) rather than guessed at.

### 10. UTC, everywhere, again

Same rule and same reason as ADR-0047 §8: a day is a day. The moment local time
enters the grid, an issue due "the 14th" renders in the 13th's cell for anyone
west of UTC, and the bug reproduces only for them.

### 11. A bar is a tinted pill, not a filled block

The first version filled each bar with a solid status colour and white text. On
real data it turned a month into horizontal stripes: the gridlines vanished
behind the fill, the dates stopped being readable, and every row shouted at the
same volume. A calendar whose background you cannot see is not a calendar.

A bar is now a pale wash with a 3px accent on its leading edge and ordinary
foreground text, with a 4px gutter each side so the cell borders show through.
Colour still carries status, as a mark rather than a floodlight — the same
reason Design Principles §2 never lets colour work alone. Only HIGHEST and HIGH
priority get a dot; a mark on every bar is texture, not signal.

### 12. The calendar opens on MY open work, not the project's

A whole project's month is not a calendar. VERUS Web Platform carries ~350 open
dated issues in any six-week window — about fifty a day against the four that
fit in a cell. Every cell read "+46 more", and a grid that can show eight
percent of itself is a worse answer than the issue list it sits next to.

So the default filter is `openOnly` **and** assigned-to-me. That is what a
calendar is for — Outlook, Google and Jira's calendar all default to the
person — and the project-wide month becomes the thing you opt into.

Two properties make this safe rather than presumptuous: it is set as the initial
**filter**, so the bar visibly shows "Open (not done)" with "Assigned to me"
lit and one click widens either; and the empty state says which default it is,
because an empty calendar and a narrow filter look identical on screen.

Note what this does NOT fix: the density is still there, and clearing the chip
brings it back. The honest answer to a genuinely crowded month is a narrower
scope, not a cleverer grid.

## Consequences

**Good.** No migration. One write path shared with the Timeline. One definition
of what a date means, now enforced by a shared module rather than by care. The
most-requested "what's due this week" view, at the cost of one pure algorithm
and a grid.

**Costs.** Lane packing is the first genuinely non-trivial layout algorithm in
the codebase. The three-bars-per-cell cap means a busy day must be opened to be
read in full. Month view fetches a six-week window, so the filter matters more
here than on a list.

**Not decided here.** Day view, calendar resize, week-start configuration,
Google/Outlook calendar sync, iCal feed, recurring issues, and showing sprint
boundaries as all-day banners.
