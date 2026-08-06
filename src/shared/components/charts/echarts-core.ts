// The ONLY module in EAGLES allowed to import from `echarts` (ADR-0036 rule 1),
// enforced by an ESLint no-restricted-imports rule — exactly as Prisma is
// confined to *.repository.ts.
//
// Why it matters: `import * as echarts from "echarts"` pulls the entire library
// (every chart type, every component, the whole map/GL surface) into the client
// bundle — roughly a megabyte. Registering only what we use keeps tree-shaking
// effective. Adding a new chart type means adding it HERE, deliberately.
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart, HeatmapChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
  DatasetComponent,
  VisualMapComponent,
  AriaComponent,
} from "echarts/components";
import { LabelLayout } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  // Charts on the roadmap: velocity/throughput (bar), burndown & CFD (line),
  // status breakdown (pie/donut), the ADR-0035 people × weeks grid (heatmap).
  BarChart,
  LineChart,
  PieChart,
  HeatmapChart,
  // Components.
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent, // the dashed average line on velocity
  DatasetComponent,
  VisualMapComponent, // heat-grid intensity ramp
  AriaComponent, // canvas has no DOM; this is what a screen reader gets
  LabelLayout,
  CanvasRenderer,
]);

export { echarts };
export type { EChartsOption } from "echarts";

// ECharts' own colour parser. Exported so `chart-theme.ts` can be tested
// against the exact code path ECharts uses internally rather than a
// re-implementation of it — see the note on `normalizeColor`.
export const echartsColor = echarts.color;
