# ADR-0047 — Timeline: a start date, a bounded axis, and conflicts nobody else shows free

- Status: Accepted
- Date: 2026-08-19
- Deciders: Founding team
- Relates to: ADR-0046 (dependencies), ADR-0014 (sprints), ADR-0026/0045
  (hierarchy), `docs/02_Modules/28_timeline.md`

## Context

Dependencies (ADR-0046) gave us edges. A Timeline is what makes them mean
something: an arrow between two bars says "this cannot start until that
finishes" in a way a list of links never will.

All three competitors have one — ClickUp Gantt, Jira Timeline / Advanced
Roadmaps, Asana Timeline. It is the largest remaining visual gap.

But EAGLES cannot draw a bar today, because an `Issue` has exactly one date:
`dueDate`. A bar needs two ends. That is the first decision, and it is a schema
change, so it goes in an ADR before any pixel is drawn.

## Decision

### 1. `Issue.startDate`, alongside the existing `dueDate`

One nullable column. `startDate` is the bar's left edge, `dueDate` its right.

Rejected alternatives, both of which avoid the migration and both of which lie:

- **Derive the start from the sprint.** Only sprinted issues would have bars,
  and every bar in a sprint would be the same length — a chart that draws the
  sprint, not the work.
- **Use `createdAt` as the start.** "When somebody typed it in" is not when the
  work starts. A bar from creation to due date would make every old issue look
  like a six-month epic.

All three tools store an explicit start. So do we.

### 2. What appears on the axis, and what a single date means

**A due date is the minimum.** An issue with neither date is unscheduled and is
not drawn — a timeline that invents positions for undated work is a timeline
nobody can trust.

An issue with a **due date but no start** renders as a **one-day bar** on its
due date, not as nothing and not as a bar stretching back to some invented
origin. That is ClickUp's behaviour, and it is the honest reading: what we know
is the deadline.

Undated issues are not hidden either — they sit in an **Unscheduled tray**
beside the chart and are dragged onto it to be scheduled. Hiding them entirely
is how a timeline silently drifts out of date with the project.

### 3. An Epic's bar is rolled up from its children when it has no dates

An Epic rarely carries its own dates; its children do. So an Epic with no dates
spans `min(child start) … max(child due)`, and that bar is **read-only** —
dragging a number that is computed from other numbers is a control that cannot
do what it appears to.

An Epic that *does* carry its own dates uses them and is draggable. Two
behaviours, distinguished by a visible difference: a rolled-up bar is drawn as
an outline, an explicit one as a solid.

### 4. Dependency arrows come from the existing link table — and so do conflicts

Arrows are `BLOCKS` links (ADR-0046). No new storage.

The part worth building: a `BLOCKS` link whose **blocker finishes after its
dependent starts** is an impossible plan, and the timeline says so — a red
arrow and a count in the header.

This is the one thing here that is better than the competition rather than
equal to it. Jira detects dependency conflicts only in **Advanced Roadmaps**, a
paid add-on; ClickUp and Asana draw the arrow and leave you to eyeball the
dates. It costs us nothing: both dates are already loaded to draw the two bars,
so the check is a comparison, not a query.

It is a **warning, not a refusal**, for the same reason as ADR-0046 §5 — dates
are a plan, and a plan being wrong is information, not an error to block.

### 5. Sprint bands on the axis

Sprints already carry `startDate`/`endDate` (ADR-0014). They are drawn as shaded
bands behind the bars.

Cheap, and specific to us: ClickUp has no sprint concept to draw, Jira shows
sprint markers only in the paid Plans product. For a team that commits in
sprints, "this bar crosses two sprint boundaries" is the fastest way to see that
an estimate is wrong.

### 6. Bounded rows, always

The axis renders at most `MAX_TIMELINE_ROWS` (200) bars, chosen by **soonest
due date**, and says so when it truncates.

Due date rather than start is a correctness point, not a preference. The chart
*orders* rows by effective start (`startDate ?? dueDate`), and no SQL `ORDER BY`
can express that without COALESCE — so selecting the top 200 by `startDate`
picks a different set from the one that then gets sorted and drawn, and rows the
chart had already decided to display fall off the bottom. Every drawn row has a
due date by definition, so ordering on it is total, deterministic, and a rule a
person can state: the next 200 things due. Subtasks are excluded by default via the
shared `subtask` filter, exactly as the backlog excludes them (ADR-0045 §6).

A 3,600-issue project would otherwise produce a chart that is both unusable and
slow, and "render everything" is not a feature — every tool here paginates or
groups. The shared `IssueFilter` is on the page, so narrowing is the answer
rather than scrolling.

### 7. Drag to move, drag the edges to resize — and nothing moves that you did not touch

A bar drags along the axis to shift both dates; its edges drag to change one.
Every drop is one version-checked write (ADR-0011), snapped to whole days.

**Moving an issue does not move its dependents.** ClickUp and Asana both offer
this, and it is genuinely useful — but a single drag silently rewriting fifteen
other people's dates is not something to ship without a consent model and an
undo, neither of which exists yet. Tracked (TL-2) rather than half-built.

### 8. DOM bars, SVG arrows, hand-rolled drag

Bars are absolutely-positioned elements: they need focus, hover, keyboard
access and text inside them, all of which are free in DOM and hand-built in
canvas. Arrows are one SVG overlay, because paths between two boxes are what SVG
is for.

The drag is pointer events and a pixels-per-day constant, **not** dnd-kit.
dnd-kit sorts lists; this is free positioning against a scale, and the
translation from pixels to a date is the whole job.

### 9. A bar has a minimum width, even when the scale disagrees

`barBox` floors every bar at `MIN_BAR_PX` (30px), and resize handles render on
every draggable bar rather than only on wide ones.

This is a correction, not an original decision, and the reason is worth keeping.
An issue with a due date and no start is one day long (BR-3) — which is what
almost all real data looks like, because nobody has set a `startDate` yet. At
Week zoom one day is 14px and at Month it is 4.5px. A 14px bar cannot be
grabbed, cannot host two 8px resize handles, and cannot be told apart from a
gridline. The first production timeline was made entirely of such bars, so
resizing was impossible at every zoom but Day — and the only way out of a
one-day bar *is* to resize it. The chart could not be used to do the thing it
exists for.

The cost is honest: at Month zoom a one-day bar is drawn about seven days wide.
A bar nobody can grab is worse than one slightly overstated, and the exact dates
are on the row and in the tooltip either way. The alternative — a lower floor,
or handles only above some width — was what shipped, and it is precisely the
gate that produced the bug.

## Consequences

**Good.** One new column. Arrows, conflicts and blocked state all come from
tables that already exist. Sprint bands make the chart specific to how this
org works. The date math lives in one pure module, so it is testable without
rendering anything.

**Costs.** `startDate` is a real migration on the busiest table. Every issue in
the seeded data has at most a due date, so most bars start life one day long
until someone schedules them — accurate, but it will look sparse before a team
does the work, and it makes the minimum-width floor (§9) load-bearing rather
than cosmetic. The row cap means a large project shows a subset by default.
Dependency arrows likewise only appear once someone creates a `BLOCKS` link, and
an empty chart with no arrows is indistinguishable from a broken one, so the
view says which it is.

**Not decided here.** Auto-rescheduling dependents, critical path, a
cross-project portfolio timeline, baselines, milestones as a distinct entity,
and export to image.
