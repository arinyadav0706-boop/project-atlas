# 06 — Competitive Landscape: management visibility

**Status:** v1.0 · **Date:** 2026-08-05 · **Scope:** how Jira, ClickUp, Asana,
Notion and Linear handle **workload / capacity** and **reporting charts** — the
areas EAGLES is building now.

> **Honesty note on sourcing.** This is written from working knowledge of these
> products, not from a hands-on audit performed for this document. Tiering and
> feature details change often. **Verify before quoting any of it to a client
> or putting it in sales material.** Where I am unsure, it says so.

## Why this exists

Workload (module 21) was designed from first principles — what data we hold and
what a manager actually asks — *without* a deliberate competitive pass first.
That was a gap. This document closes it, records what we should borrow, and
states what we are deliberately not copying, so the next feature starts from
the field rather than from a blank page.

---

## 1. Workload / capacity

| Product | What it does | Shape |
|---|---|---|
| **ClickUp** | The strongest mainstream implementation. *Workload view*: rows = assignees, columns = days or weeks; each cell shows allocated vs capacity as a bar or ring, green → red. Capacity is **per person** and can be counted in tasks, story points, or time. Expand a person to see the underlying tasks. | People × time grid |
| **Asana** | *Workload* (paid tier), built on Portfolios. People × weeks, bars sized by an "effort" field you nominate (hours or points), per-person weekly capacity, over-capacity highlighted. Its killer detail: **drag a task from an overloaded person to a free one inside the view**. | People × time grid + drag |
| **Jira** | Split by tier. Free/Standard: a sprint capacity bar in the backlog and an old workload pie-chart gadget — genuinely thin, which is why this question reached us at all. Premium (*Advanced Roadmaps*): per-team capacity per sprint, **per-person working hours and absences**, capacity bars per sprint. | Sprint-scoped |
| **Linear** | No capacity model. Deliberately: it optimises cycle time and throughput over resource planning, and leans on *projects* and *cycles* rather than per-person hours. | None (by choice) |
| **Notion** | Nothing native. Teams fake it with grouped boards, rollups and formula properties; newer chart blocks can bar-chart counts per assignee. No concept of capacity. | None |
| **Float / Resource Guru** *(dedicated resourcing)* | The original pattern the others borrowed: people × days grid, per-person hours/day, leave calendars, drag-to-schedule. | People × time grid |

### Where EAGLES already stands up

- **Cross-project by default.** Jira's capacity lives inside a sprint, so work
  outside the sprint is invisible; ours sums a person's queue across every
  project (21_workload.md BR-3). This is our strongest differentiator here.
- **Honest about unestimated work.** ClickUp and Asana treat a task with no
  effort value as zero and quietly understate the load. We count it, exclude it
  from effort, and say so on screen (BR-4). Nobody else does this.
- **Org-configurable working week on every tier** (8h × 6d, 9h × 5d…).
  Jira gates comparable configuration behind Premium.

### Where they are clearly ahead — and we should follow

1. ~~**Time-phased grid** (ClickUp, Asana, Float).~~ **Closed 2026-08-06**
   (ADR-0035, backlog WL-3). "Two weeks of work" is a sum; "slammed next week,
   free the week after" is a plan. We took their mechanism rather than inventing
   one: Asana's *spread from today to the due date*, Jira's *explicit dates beat
   inferred ones, fall back to sprint dates*, Jira's provenance marker, and
   ClickUp's *Unscheduled* bucket. What we did not copy is `Issue.startDate` —
   with the today→due spread it earns much less than it costs, and Gantt is the
   feature that actually requires it (WL-4).
2. **Drag-to-reassign inside the view** (Asana). Turns a report into a tool.
   Backlog WL-2.
3. **Per-person capacity + absences** (ClickUp, Jira Premium, Float).
   Backlog WL-1 — needs a time-off model, not just a field.

---

## 2. Reporting and charts

| Product | Approach |
|---|---|
| **Jira** | The widest built-in set: burndown, burnup, velocity, sprint report, control chart, cumulative flow, created-vs-resolved. Functionally the benchmark; visually dated and dense. |
| **ClickUp** | Dashboard *cards* assembled from a widget library, heavy on colour and big numbers. Very configurable, sometimes noisy; the ceiling on rigour is lower than Jira's. |
| **Asana** | Portfolio/project dashboards with a small set of clean charts and a "Universal Reporting" builder. Fewer, calmer charts than ClickUp — closest to our own visual direction. |
| **Linear** | Few charts, extremely well chosen: cycle/scope burnup, and a genuinely good analytics view. Proof that a short, correct list beats a long one. |
| **Notion** | Basic chart blocks over databases (bar, line, donut). Fine for a lightweight view, not a reporting product. |

**The lesson we take:** Jira's *coverage*, Linear's *restraint*, Asana's
*calm*. Our metric definitions (`docs/12_Metrics`) already give us something
none of them publish: a written, exact definition for every number.

---

## 3. What we are deliberately **not** copying

- **ClickUp's visual style.** Our documented direction is
  "Apple-level polish, not Jira/Atlassian density"
  (`docs/05_UI/01_UI_Design_Principles.md`). ClickUp is dense, saturated and
  widget-heavy — the opposite end. We borrow their *interaction patterns*
  (the grid, per-person capacity, drill-in), not their look.
- **Copying any competitor's UI pixel-for-pixel.** Beyond being a brand and
  legal risk, their layouts are tuned to their information model, not ours.
- **Jira's sprint-bound capacity.** Structurally blind to unsprinted work and
  useless for a kanban project like VERUS Operations.
- **Feature-count competition.** Twelve mediocre reports lose to five correct
  ones; see the metric-definitions rules.

---

## 4. Standing implications for the roadmap

| # | Implication | Where tracked |
|---|---|---|
| 1 | ~~Time-phased workload is the single biggest gap vs ClickUp/Asana~~ — closed | ADR-0035 (Accepted), backlog WL-3 |
| 2 | Reassign from the workload view converts a report into a tool | Backlog WL-2 |
| 3 | Per-person capacity + time off is table stakes at the top tier | Backlog WL-1 |
| 4 | Our charts need a shared visual standard before we add more | `docs/05_UI/03_Data_Visualisation.md` |
| 5 | Published metric definitions are a genuine differentiator — use them in sales | `docs/12_Metrics` |
