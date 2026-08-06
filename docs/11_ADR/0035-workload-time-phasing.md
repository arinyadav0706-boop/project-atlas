# ADR-0035: Time-phased workload (the people × weeks grid)

**Status:** **Accepted** — 2026-08-06.
**Date:** 2026-08-05 (proposed), 2026-08-06 (accepted)
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
                Overdue   Aug 3–7   Aug 10–14   Aug 17–21   Aug 24–28   Later   Unscheduled
Daniel Ahmed      6h       32h        18h          4h          —         —        25h
Priya Nair         —        6h        40h         12h          —        8h         9h
```

Reading that: Daniel is loaded **now** and clear later; Priya's crunch is
**next** week. Same totals as today, a completely different conversation.

## How the industry solves this

We checked the three products before designing anything, because the hard part
— *"which week does this work happen in?"* — is a problem all of them have
already had to answer.

| | Date sources it schedules from | No start date | No dates at all |
|---|---|---|---|
| **Asana** | start + due | spreads effort **from today → due date** | off the chart |
| **ClickUp** | start + due | needs start *or* due; splits the estimate evenly across the span | **"Unscheduled"** bucket |
| **Jira Advanced Roadmaps** | **configurable**: target start/end (default), due date, **sprint dates**, custom fields, releases | plan setting: *"Use sprint dates when work items don't have start and end dates"* | not scheduled |

Three things we take directly from that:

1. **Nobody lumps a long task into its due week.** Asana spreads it from *today*
   to the due date. So the "spike" that motivated wanting `Issue.startDate` is
   solved without the field.
2. **Jira's precedence rule:** an **explicitly set date overrides an inferred
   one**; sprint dates fill the gap only where issue dates are absent.
3. **Jira shows provenance.** A date inferred from a sprint renders with an
   **"S"** beside it (releases get "R"), so the user can see which dates the
   system guessed. An inference engine that hides its inferences is not
   trustworthy.

Sources: [Asana — workload effort for tasks with a date
range](https://forum.asana.com/t/workload-effort-for-tasks-with-a-date-range/84004),
[Jira — change the date field used to schedule work
items](https://support.atlassian.com/jira-software-cloud/docs/configure-which-dates-advanced-roadmaps-uses/),
[Jira — schedule work items according to
sprints](https://support.atlassian.com/jira-software-cloud/docs/schedule-issues-in-advanced-roadmaps-according-to-sprints/),
[ClickUp — add and manage tasks in Workload
view](https://help.clickup.com/hc/en-us/articles/30799870854423-Add-and-manage-tasks-in-Workload-view).

## Decision

### 1. A `scheduling` feature module owns "when does this work happen"

The question is not a workload question. Gantt/Timeline and Calendar (V2 Epic 6,
`docs/00_Product/05_V2_Management_Visibility_Layer.md`) need to answer it
**identically**, and Jira's own architecture separates one scheduling engine
from the many views on top of it. Burying the logic in workload guarantees that
V2 Gantt re-derives its own dates and the two views disagree.

So: `src/features/scheduling/lib/` — three pure, unit-tested files
(`weeks.ts`, `resolve-window.ts`, `distribute.ts`) and a types file. No I/O, no
Prisma, no React. Workload is its first consumer, not its owner.

### 2. The resolution chain

Ordered; the first match wins. Jira's precedence, Asana's fallback,
ClickUp's bucket for the undated.

| # | Condition | Window | `source` |
|---|---|---|---|
| 1 | `startDate` **and** `dueDate` | start → due | `ISSUE_DATES` |
| 2 | `dueDate` only | **today → due** | `DUE_ONLY` |
| 3 | in a sprint with `startDate` **and** `endDate` | sprint start → sprint end | `SPRINT_DATES` |
| 4 | none of the above | — | **Unscheduled** |

Then, applied to whichever window matched:

- the window's `from` is **clamped to today** — effort cannot be scheduled into
  days that have already passed;
- if the window's `to` is already **in the past**, the whole issue goes to
  **Overdue** instead. This covers both a missed due date and an issue still
  open in a sprint that has already ended: committing to a sprint *is* a date
  commitment.

**Branch 1 is written but dormant** — `Issue.startDate` does not exist (WL-4).
It is one branch in one pure function, which is the entire cost of adding the
field later.

Effort is spread evenly across the **working days** in the window (per the
organization's configured working week, ADR-0034 amendment), then summed into
week buckets. Weeks are UTC, Monday-start.

### 3. The columns

`Overdue` · four fixed week columns · `Later` · `Unscheduled`.

- **Four weeks, fixed.** Not configurable 4/8/12 — twelve columns is
  quarter-planning nobody has asked for, and the page is already dense. Revisit
  if managers ask.
- **Headers are real dates** — `Aug 3–7`, not `+2 wk`. None of the three
  products uses relative labels; a manager should recognise the week from their
  own calendar rather than counting forward in their head.
- **`Later`** holds effort that spreads past the fourth week. ClickUp and Asana
  scroll through time and so never need it; our horizon is fixed, so without it
  a task due in ten weeks would silently lose most of its effort and break the
  invariant below. An honest small column beats a broken total.
- **`Overdue` and `Later` appear only when they carry something.** The grid
  reflows, so an empty red column never becomes wallpaper managers learn to
  ignore, and a team whose work all lands inside the month sees four clean week
  columns.
- **`Unscheduled` is always shown.** "Half your team's work has no date" is the
  most useful thing this grid will tell a manager on day one, and it must not be
  hidden to make the chart look tidy.

**Invariant:** a person's total across every column always equals the single
number today's list view shows. The grid only redistributes; it never invents or
drops effort. Rounding uses largest-remainder so the cells sum exactly.

### 4. The cell

Shows **hours**; **colour encodes percentage of that person's weekly capacity**.
Hours alone force the reader to remember whether the org runs a 40h or 48h week;
percentage alone loses whether that is 4 hours or 40. Magnitude in the text,
pressure in the colour. Over capacity gets a border **and** a label, never
colour alone (`docs/05_UI/03_Data_Visualisation.md` §4 rule 4).

### 5. Provenance marker

A cell whose effort came from **sprint** dates rather than the issue's own dates
carries a small `S`, with a legend. Straight from Jira. The `source` already
rides along on every resolved window, so this costs nothing and it is what makes
inferred numbers honest rather than magic.

### 6. `Issue.startDate` is **not** added

Stays as **WL-4**, owned by the Gantt/Timeline module. Rationale: with rule 2
spreading today→due, the spike that justified the field largely disappears;
Gantt genuinely cannot exist without per-issue start dates while workload can;
and adding it now would settle a V2 schema question — including how issue dates
and sprint dates should compete — with no V2 UI to validate the answer against.

### 7. It is a DOM table, not an ECharts canvas

ADR-0036 makes ECharts the charting standard, and `03_Data_Visualisation.md` §5
lists `HeatGrid` among the chart specs — but that same document's rules decide
this one against a canvas: cells must be **keyboard-reachable** (§4 rule 10),
values must **not live only in a tooltip** (§4 rule 3), and the grid needs a
**sticky first column** (§5). A semantic `<table>` with theme-token backgrounds
delivers all three; an ECharts heatmap delivers none of them. This is a
deliberate, scoped exception, recorded here so it does not read as drift.

## What this shows — and does not

It shows **demand by deadline**, not a plan of who does what when. A real
resource planner lets you schedule effort into slots; we infer from dates the
team already keeps — exactly as ClickUp and Asana do. The label on screen says
"by due date", never "plan".

### Expected coverage on real data

Against the VERUS demo (~7,240 issues), roughly **30% carry a due date** and a
further slice sit in sprints with end dates. A large Unscheduled column is not a
bug — it is an accurate picture of how much work has no date. We will not
fabricate dates to make the grid look full.

## Alternatives considered

| Option | Rejected because |
|---|---|
| Put the bucketing inside `features/workload` | Modular, but not extensible: V2 Gantt and Calendar would each re-derive dates and drift out of agreement with the grid. The seam belongs where Jira puts it. |
| All effort in the due week (the original Phase 1) | Not what anyone does. Asana spreads today→due. Lumping invents false calm followed by a false spike. |
| Replace the list with the grid | The list answers "who is overloaded" at a glance; the grid answers "when". Different questions, both wanted. |
| Days instead of weeks | 20+ columns for a 4-week horizon, and our data is nowhere near day-precise. False precision. |
| Configurable date source (Jira's full model) | Right shape, too early. The chain is an ordered list, so making it configurable later is a config change, not a rewrite. |
| Drop effort that falls past the horizon | Breaks the totals invariant silently. Hence `Later`. |
| Hide undated work | Deletes the most useful signal to make the chart tidy. |

## Consequences

- **Positive:** closes the main gap against ClickUp/Asana; **no schema change**;
  the scheduling module is the seam Gantt, Calendar and forecasting all attach
  to; provenance keeps inferred numbers honest; the existing scope, RBAC and
  arithmetic are untouched.
- **Trade-offs:** only as good as the team's date hygiene; a second view to keep
  consistent with the list; `Later` is a column the scrolling competitors do not
  need.
- **Cost:** four pure files in `features/scheduling` plus tests, two extra
  selected columns in one existing repository query, the grid component, and a
  view toggle.
- **Untouched, verified:** sprint planning (`sprint.service.ts` never reads
  `Issue.dueDate`), reports, and every metric definition — none of them read
  issue date fields, so none of them change.

## Follow-ups

- **WL-4** (`Issue.startDate`) stays open, reassigned to the Gantt/Timeline
  module — chain rule 1 is already written and dormant.
- Configurable date source (Jira's plan setting) if a second consumer wants a
  different order.
- Due date as a *deadline constraint* — Jira warns when sprint scheduling pushes
  work past its due date. Natural once both date sources are live.
