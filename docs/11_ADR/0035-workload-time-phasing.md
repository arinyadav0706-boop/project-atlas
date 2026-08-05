# ADR-0035: Time-phased workload (the people × weeks grid)

**Status:** **Proposed** — not built. Decisions in §Open questions are still open.
**Date:** 2026-08-05
**Deciders:** Founders (Arin), acting CTO

## Context

Workload today (ADR-0034) answers *"how much is queued against this person?"* —
one number: "Daniel: 79h ≈ 2 weeks". Useful, but it hides *when*:

- Daniel: 2 weeks of work, **all due Friday** → he is on fire right now.
- Priya: 2 weeks of work, **spread over the next month** → she is fine.

Identical rows today. ClickUp, Asana and the dedicated resourcing tools all
solve this with a **people × time grid**
(`docs/00_Product/06_Competitive_Landscape.md` §1), and it is our single
biggest gap against them.

## What the grid is

Rows are people; columns are calendar weeks. Each cell holds the remaining
effort of that person's open issues that fall in that week, coloured by how
that compares to their weekly capacity:

```
                Overdue   This wk   Next wk   +2 wk   +3 wk   Unscheduled
Daniel Ahmed      6h       32h       18h        4h      —        25h
                  ▓        ████      ██         ░                ███
Priya Nair         —        6h       40h       12h      —         9h
                           █         ████       ██               ██
```

Reading that: Daniel is loaded **now** and clear later; Priya's crunch is
**next** week. Same totals as today, a completely different conversation.

## How an issue is placed in a week — the bucketing rule

This is the crux, and it must be a written rule, not an implementation detail:

1. **`dueDate` is in the past** → the **Overdue** column.
2. **`dueDate` is set** → the week containing that due date.
3. **No due date, but the issue is in a sprint with an `endDate`** → the week
   containing the sprint end. (Committing to a sprint *is* a date commitment.)
4. **Neither** → the **Unscheduled** column.

A person's *total* across all columns always equals the single number today's
view shows. Nothing is invented or dropped; the grid only redistributes.

### What this actually shows — and does not

It shows **demand by deadline**, not a plan of who does what when. A real
resource planner lets you schedule effort into slots; we are inferring from
dates the team already keeps. ClickUp and Asana do the same thing, so we are in
normal company — but the label on screen must say "by due date", never "plan".

### The `startDate` limitation (important)

`Issue` has `dueDate` but **no `startDate`**. So a 3-week task lands entirely in
its due week — a spike where reality is a spread. Two options:

- **Phase 1 (no schema change):** all remaining effort in the due week. Lumpy,
  but truthful and immediately useful.
- **Phase 2:** add `Issue.startDate`, spread effort evenly across the working
  days between start and due. Needs a doc + migration + UI, so it is its own
  decision — not smuggled in here.

### Expected coverage on real data

Against the VERUS demo (~7,240 issues): roughly **30% carry a due date**, and a
further slice sit in sprints with end dates, so a meaningful share lands in real
weeks and the rest in **Unscheduled**. A large Unscheduled column is not a bug —
it is an accurate picture of how much work has no date, and arguably the most
useful thing the grid will tell a manager on day one. We will not fabricate
dates to make the grid look full.

## Decision (proposed)

Add a **grid view** to `/workload`, alongside (not replacing) today's list:

- Rows: the selected team's direct members, same scope and RBAC as ADR-0034.
- Columns: Overdue · this week · next week · +2 · +3 · Unscheduled (weeks
  configurable later; UTC week boundaries, Monday start).
- Cell: summed remaining effort per the bucketing rule, rendered with the
  `HeatGrid` primitive (`docs/05_UI/03_Data_Visualisation.md` §5).
- Cell intensity compares against the org's weekly capacity (ADR-0034
  amendment); over-capacity gets a border **and** a label, never colour alone.
- Clicking a cell lists the issues behind it — same drill-in guard as BR-11.
- The list view stays the default; the grid is a toggle. Two views of one
  service call, one set of numbers.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Replace the list with the grid | The list answers "who is overloaded" in one glance; the grid answers "when". Different questions, both wanted. |
| Days instead of weeks | 20+ columns for a 4-week horizon, and our data (due dates, sprint ends) is nowhere near day-precise. False precision. |
| Spread every issue evenly from today to its due date | Invents a schedule nobody agreed to, and makes every cell non-zero — pretty and meaningless. |
| Infer dates from sprint start rather than end | Sprint end is the commitment; start is when the sprint began, not when the work is due. |
| Hide undated work | The single most useful signal ("half your team's work has no date") would be deleted to make the chart tidy. |

## Consequences

- **Positive:** closes the main gap against ClickUp/Asana; needs **no schema
  change** in Phase 1; surfaces undated work as a first-class finding; reuses
  the existing scope, RBAC and arithmetic untouched.
- **Trade-offs:** lumpy until `startDate` exists; only as good as the team's
  date hygiene; another view to keep consistent with the list.
- **Cost:** one repository query extended to select `dueDate` and sprint
  `endDate`, a pure bucketing function (unit-tested like `capacity.ts`), the
  `HeatGrid` primitive, and a view toggle.

## Open questions — decide before building

1. **Horizon:** 4 weeks, or configurable 4/8/12?
2. **Unit in the cell:** hours, or percentage of that week's capacity?
3. **Overdue column:** always shown, or only when non-empty?
4. **Phase 2 `startDate`:** do we want it at all, or is due-week good enough?
   (Affects Gantt/waterfall too — likely decided together with that module.)
