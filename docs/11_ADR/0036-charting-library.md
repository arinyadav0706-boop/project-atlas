# ADR-0036: Apache ECharts is the single charting standard

**Status:** Accepted
**Date:** 2026-08-06
**Deciders:** Founders (Arin), acting CTO
**Supersedes:** §3 of `docs/05_UI/03_Data_Visualisation.md` (the in-house SVG kit)

## Context

`docs/05_UI/03_Data_Visualisation.md` chose an in-house SVG chart kit, and it
shipped (UI-1): pure geometry, a `ChartFrame`, `BarChart`, `DonutChart`, and a
rebuilt velocity chart. It was correct and tested.

It was also the wrong long-term call, for a reason that outranks the ones in
that table: **the roadmap needs charts the kit does not have.** Burndown and
burnup (dual-series lines with a today marker), cumulative flow (stacked area),
the ADR-0035 people × weeks heat grid, throughput, aging WIP. Building each of
those by hand means each arrives with its own axis handling, its own tooltip,
its own empty state, and its own bugs — the exact fragmentation the kit was
meant to prevent, just moved one level up.

The founder's call, and it is the right one: **one charting standard, applied
to everything, rather than a hand-rolled kit for simple charts and a library
for complex ones.** A hybrid means two mental models, two sets of edge cases,
and two places for a defect to hide. Consistency is worth more than the bundle
bytes.

## Decision

**Apache ECharts (`echarts` 6.x, Apache-2.0) is the only charting library in
EAGLES.** Every chart — existing and future — is an ECharts chart.

### Why ECharts over Recharts / Nivo / visx

| | Verdict |
|---|---|
| **Coverage** | Covers every chart on the roadmap *today*, including the heat grid and cumulative flow. Recharts struggles with heatmaps; Nivo splits them across separate packages. |
| **Licence** | Apache-2.0 — unencumbered for a commercial, self-hostable product we ship to clients. |
| **Dependencies** | Only `tslib` + its own renderer `zrender`. No React-version coupling, so a React 19 upgrade cannot break our charts (unlike React-specific wrappers). |
| **Scale** | Canvas rendering handles thousands of points; our 7k-issue demo org will grow. |
| **Out of the box** | Genuinely the best-looking and most interactive of the four — the stated goal. |

### The rules that make one standard actually hold

1. **One import site.** `src/shared/components/charts/echarts-core.ts` is the
   *only* module allowed to import from `echarts`, and it registers exactly the
   charts and components we use (modular imports, so tree-shaking works).
   Enforced by an ESLint `no-restricted-imports` rule, exactly as Prisma is
   confined to `*.repository.ts` (CLAUDE.md rule 4). Without this, one
   `import * as echarts from "echarts"` silently adds ~1 MB.
2. **One React wrapper**, ours (~80 lines): `chart.tsx` loads the canvas
   component through `next/dynamic({ ssr: false })` — ECharts is browser-only
   and would otherwise break SSR — and handles init, `setOption`, resize and
   dispose. We do **not** take `echarts-for-react`: it is a thin wrapper we
   would still have to fight for theming, and it is another dependency to track.
3. **Options are built by pure functions**, one per report, in
   `charts/options/`. They take our DTOs and return an ECharts option object,
   and they are **unit-tested** — asserting the zero-based axis, the average
   line, labels that are not tooltip-only. This preserves the one property the
   in-house kit got right: the rules live in tested code, not in JSX.
4. **Theme comes from our CSS variables at runtime.** Canvas cannot read
   Tailwind classes, so a hook resolves the tokens off the document and rebuilds
   the theme when the `dark` class changes. No hex in any option builder.
5. **`aria` is enabled on every chart.** Canvas emits no DOM, so a chart is
   invisible to a screen reader unless ECharts' description generator is on;
   each chart also carries a visually-hidden text summary.
6. **Colours must be *parseable*, not merely paintable — always comma
   syntax.** Canvas `fillStyle` is parsed by the browser, which accepts modern
   `hsl(217 91% 55%)`. ECharts computes hover/emphasis colours in JavaScript
   with zrender's own parser, which accepts only the legacy
   `hsl(217, 91%, 55%)`. On failure it returns `undefined` and `lift()` has no
   else-branch, so the emphasis fill becomes `undefined` and **the hovered
   element renders with no fill at all** — correct at rest, invisible on
   interaction, no error anywhere. `normalizeColor` in `chart-theme.ts` is the
   single conversion point and `chart-theme.test.ts` runs every token through
   ECharts' real parser. Option builders additionally state `emphasis`
   explicitly rather than relying on the derived colour.

### Where ECharts is NOT used — the one explicit boundary

**A progress bar is not a chart.** A single-value CSS bar (the workload row's
load bar), a status dot, or a badge stays plain CSS/HTML. Mounting a canvas
instance per table row would be slow and absurd, and it is not what "one
charting standard" means.

The line, so it never becomes a judgement call: **if it has an axis, a data
series, or a legend, it is ECharts. If it is one bar or one dot with no axis,
it is CSS.**

## Consequences

- **Positive:** every chart looks and behaves the same; the roadmap's hard
  charts (heat grid, CFD, burndown) become configuration rather than
  construction; interactions (legend toggle, tooltip, save-as-image) come free
  and are consistent; one place to fix a rendering bug.
- **Negative / accepted:**
  - **Bundle cost.** Modular imports for bar/line/pie plus the grid, tooltip,
    legend and title components land in the low hundreds of kB minified. Rule 1
    is what keeps it from becoming a megabyte, and it is lint-enforced.
  - **Canvas is not the DOM.** Accessibility and theming are deliberate work
    (rules 4 and 5) rather than free as they were with SVG.
  - **Work is discarded.** `ChartFrame`, `BarChart` and `DonutChart` from UI-1
    are deleted along with the geometry they needed (`niceScale`, `barLayout`,
    `yForValue`, `donutArcs`) and their tests. `mean`, `percentOf` and
    `shortSeriesLabel` survive as data-prep helpers. About 300 lines, one
    unmerged PR — cheap, and the sunk cost is not a reason to keep two systems.
  - The `--success` / `--warning` theme tokens added in UI-1 are **kept**; they
    were needed regardless and now feed the ECharts theme.
- **Follow-up:** `docs/05_UI/03_Data_Visualisation.md` §3 is superseded by this
  ADR; its rules (§4), specifications (§5) and colour semantics (§6) still
  stand and are now implemented through ECharts options.
