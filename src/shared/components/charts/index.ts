// The charting surface every feature imports from (ADR-0036).
//
// Nothing outside `echarts-core.ts` may import `echarts` directly — that rule
// is what keeps the bundle from silently absorbing the whole library, and it is
// enforced by ESLint (no-restricted-imports), exactly as Prisma is confined to
// repositories.
export { Chart, ChartEmpty } from "./chart";
export type { ChartCanvasProps } from "./chart-canvas";
export {
  resolveChartTheme,
  toneColor,
  FALLBACK_CHART_THEME,
  type ChartTheme,
  type ChartTone,
} from "./chart-theme";
export { mean, percentOf, shortSeriesLabel } from "./geometry";

// Option builders — one per chart, pure and unit-tested.
export {
  velocityOption,
  velocitySummary,
  type VelocitySprint,
} from "./options/velocity-option";
export {
  statusDonutOption,
  statusDonutSummary,
  type StatusSegment,
} from "./options/status-donut-option";
export {
  distributionBarOption,
  distributionBarSummary,
  type DistributionSegment,
} from "./options/distribution-bar-option";
export {
  capacityBarsOption,
  capacityBarsSummary,
  capacityBarsHeight,
  type CapacityBar,
  type CapacityReference,
} from "./options/capacity-bars-option";
