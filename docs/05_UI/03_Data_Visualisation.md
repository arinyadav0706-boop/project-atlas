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

## 3. Decision: a shared in-house SVG chart kit — no chart library

Charts live in `src/shared/components/charts/`, built on plain SVG plus our
Tailwind tokens: `<ChartFrame>` (axes, gridlines, labels, empty state),
`<Bars>`, `<Line>`, `<Donut>`, `<HeatGrid>`, `<Sparkline>`, `<Legend>`,
`<ChartTooltip>`.

**Why not Recharts / visx / Chart.js:**

| Consideration | Verdict |
|---|---|
| Our chart types | Bar, line, donut, KPI, heat grid — all trivial in SVG. We do not need brushing, zooming or 3-D. |
| Bundle | A charting library is 50–150 kB for charts we can draw in a few hundred lines. |
| Theming | Libraries fight our CSS-variable theme; native SVG uses `currentColor` and our tokens directly. |
| Portability (rule 8) | Zero new dependency, zero version churn, no React-major-upgrade risk. |
| Escape hatch | If we ever need real interactivity (brush-zoom, huge series), adopt `visx` **for that chart only** — the `ChartFrame` contract stays. |

**This is not a licence to hand-roll per feature.** Every chart uses the kit; a
one-off chart in a feature folder is a defect.

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

1. Build the kit with `ChartFrame` + `Bars`; **rebuild velocity on it** (fixes
   V1–V7). Backlog **UI-1**.
2. Move the donut onto theme tokens.
3. Workload: team distribution bar + person bar chart with axis. Backlog **UI-2**.
4. `HeatGrid` when ADR-0035 (time-phased workload) is accepted.
