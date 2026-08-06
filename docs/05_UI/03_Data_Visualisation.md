# 03 — Data Visualisation Standard

**Status:** v1.0 · **Date:** 2026-08-05 · **Applies to:** every chart, bar,
gauge and grid in EAGLES (reports, workload, dashboards, future analytics).

Extends `01_UI_Design_Principles.md` ("Apple-level polish, not
Jira/Atlassian density"). Numbers must obey `docs/12_Metrics`; this document
governs how they are **drawn**.

---

## 1. Why this exists now

We are about to add a lot of charts (burndown, throughput, lead time, aging
WIP, the workload grid). Today every chart is hand-rolled in isolation, so each
new one re-invents its own axis, colours and empty state — and the quality
shows. Agreeing the visual grammar once is cheaper than retrofitting eight
charts later.

## 2. Honest audit of what we ship today

`src/features/reports/components/report-card.tsx`:

**Velocity (bar) — the weakest thing in the product.**

| # | Defect | Why it matters |
|---|---|---|
| V1 | **No axis, no gridlines, no baseline.** Bars float in space. | You cannot read a value off the chart, only off the label above each bar. |
| V2 | **Bars are scaled to the tallest bar**, not an absolute scale. | 34/34/34 looks identical to 5/5/5. Every chart looks "full", so the shape carries no information. |
| V3 | **No average or trend line.** | Velocity exists to show a trend and support forecasting; a bare bar set answers neither. |
| V4 | **Sprint names truncated** to nothing legible at 8 bars. | The x-axis is unreadable exactly when the chart is most useful. |
| V5 | **Issue count hidden in a `title` tooltip.** | Tooltips do not exist on touch devices — the data is simply missing there. |
| V6 | **A zero-point sprint renders a 2px sliver.** | Ambiguous with "no data"; a genuine zero should read as an explicit zero. |
| V7 | Flat accent fill, hard `rounded-t`, no spacing rhythm. | Reads as a debug view rather than a product surface. |

**Status breakdown (donut)** is acceptable: correct arcs, legend with values,
readable centre total. Its flaw is **hard-coded hex colours** that ignore the
theme.

**Cycle time (KPI)** is genuinely good — big number, unit, and the sample size
and window stated underneath. It is the model the others should follow for
honesty.

## 3. Decision: Apache ECharts, everywhere — see ADR-0036

**Superseded.** This section originally chose an in-house SVG kit. It shipped,
then was replaced the same day by **ADR-0036: Apache ECharts is the single
charting standard**. The reasoning is there in full; the short version:

- The roadmap needs charts the kit did not have — burndown, cumulative flow,
  the ADR-0035 heat grid. Hand-rolling each would fragment exactly what the kit
  was meant to unify.
- A hybrid (kit for simple, library for complex) means two mental models and
  two places for a bug to hide. One standard is worth more than the bytes.

**The rules that keep one standard honest** (all enforced, see ADR-0036):

| # | Rule | Enforcement |
|---|---|---|
| 1 | Only `charts/echarts-core.ts` may import `echarts`, and it registers only the pieces we use | ESLint `no-restricted-imports` (verified to fire) |
| 2 | One React wrapper, loaded via `next/dynamic({ ssr: false })` — ECharts is browser-only | `charts/chart.tsx` |
| 3 | Options are built by **pure, unit-tested functions** in `charts/options/` | The display rules in §4 are asserted there |
| 4 | Theme is resolved from CSS variables at runtime, rebuilt on dark-mode toggle | `charts/chart-theme.ts` + a MutationObserver |
| 5 | `aria` enabled on every chart, plus a visually-hidden text summary | canvas emits no DOM |

**Measured cost:** shared First Load JS is unchanged (87.6 kB); ECharts is a
single **222 kB gzipped lazy chunk**, fetched only when a chart mounts.

**The boundary:** a progress bar is not a chart. If it has an axis, a series or
a legend it is ECharts; a single bar or dot with no axis stays CSS. Mounting a
canvas per table row would be slow and absurd.

## 4. Rules

1. **Absolute scale by default.** The y-axis starts at zero and is scaled to a
   meaningful maximum, not to the tallest bar. Never truncate an axis to
   exaggerate a difference.
2. **Every chart has a readable axis** — gridlines and tick labels, or an
   explicit reason not to (KPI, sparkline).
3. **Nothing lives only in a tooltip.** Tooltips enrich; they never carry the
   primary value. Touch users must get the same information.
4. **Never colour alone.** Status is a label plus a colour. Colours must be
   distinguishable for the common colour-vision deficiencies.
5. **Theme tokens only** — no hard-coded hex. Charts must survive a theme swap
   and a white-label deployment.
6. **Empty ≠ zero ≠ unknown.** Three distinct renderings: "No completed
   sprints yet", a genuine `0`, and "not measurable — 14 unestimated".
7. **State the basis.** Sample size, window and unit sit with the chart
   ("across 37 issues in the last 30 days"), per the metric-definition rules.
8. **Responsive and printable.** Charts reflow to container width; wide grids
   scroll horizontally inside their own container, never the page.
9. **Motion is a transition, not decoration** — a brief ease on value change;
   no entrance animations that delay reading.
10. **Accessible.** A chart is a `figure` with a caption, has a text summary
    for screen readers, and every interactive cell is keyboard-reachable.

## 5. Chart specifications

| Type | Use for | Key requirements |
|---|---|---|
| **Bar** | Velocity, throughput per week | Zero-baseline y-axis, gridlines, value labels, **dashed average line**, rotated or abbreviated x-labels, explicit zero rendering |
| **Line** | Burndown, burnup, trend | Ideal/actual pair, today marker, dots on data points, gap (not zero) for missing data |
| **Donut** | Status breakdown | Centre total, legend with absolute values *and* percentages, ordered by workflow not by size |
| **KPI** | Cycle time, lead time | Big value, unit, sample size, window, and delta vs the previous window when available |
| **HeatGrid** | Workload people × weeks (ADR-0035) | Row = person, column = week, cell intensity = load vs capacity, over-capacity gets a distinct border **and** a label, sticky first column, horizontal scroll |
| **Sparkline** | Inline trend in a table row | No axis, no labels; always paired with a number |

## 6. Colour semantics

One meaning per colour across the product:

| Meaning | Token |
|---|---|
| Neutral / default series | `accent` |
| Good, complete, healthy | `success` |
| Needs attention, over capacity, overdue | `destructive` |
| Warning / in review / approaching a limit | `warning` |
| Absent, unknown, unestimated | `muted-foreground` at reduced opacity, plus a text label |

Sequential intensities (heat grid) use a single hue's opacity ramp — never a
rainbow, which invents categories that do not exist.

## 7. Rollout

1. ✅ **Done 2026-08-06 (UI-1), then re-done on ECharts the same day
   (ADR-0036).** `src/shared/components/charts/`: `echarts-core.ts` (the single
   import site), `chart.tsx` + `chart-canvas.tsx` (the one wrapper),
   `chart-theme.ts` (CSS-variable bridge), `options/` (pure, tested option
   builders), `geometry.ts` (the data-prep helpers that survived). Velocity and
   the donut both run on it — V1–V7 all closed. The SVG components
   (`ChartFrame`, `BarChart`, `DonutChart`) and their layout maths were deleted
   rather than left as a second system.
2. ✅ **Done 2026-08-06 (UI-3).** The donut takes a semantic `ChartTone`
   instead of hex. Required adding `--success` and `--warning` to the theme
   (`globals.css` + `tailwind.config.ts`, light and dark) — §6 referenced
   tones that did not exist.
3. ✅ **Done 2026-08-06 (UI-2).** Workload's team-mix stacked bar and
   per-person capacity bars, both on the kit. Two lessons went into the
   builders and are now regression-tested: a markLine draws **above** the
   series by default, so a threshold line struck the bar captions through
   (fixed with `z` below the series), and an axis max derived as `1.15 ×`
   the busiest value produces tick labels like "3.91 wk" (rounded up to a
   half week).
4. ✅ **Done 2026-08-06 (WL-3).** `HeatGrid` — the workload people × weeks grid,
   shipped with ADR-0035. Built as a semantic `<table>` rather than an ECharts
   canvas, and that is a decision this document forced rather than a deviation
   from it: §4 rule 3 says values may not live only in a tooltip, rule 10
   requires cells to be reachable, and §5 asks for a sticky first column. A
   canvas delivers none of the three. The colour ramp follows §6 — one hue's
   opacity, with over-capacity carrying a ring and a destructive-toned label so
   the signal never rests on colour alone. ADR-0035 §7 records the exception to
   ADR-0036 so it does not read as drift.
