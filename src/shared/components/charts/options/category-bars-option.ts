import type { EChartsOption } from "@/shared/components/charts/echarts-core";
import { toneColor, type ChartTheme, type ChartTone } from "@/shared/components/charts/chart-theme";

// Horizontal bars for a labelled breakdown (ADR-0036 kit, used by dashboards).
//
// A donut stops working past about six slices — the labels collide and the eye
// cannot compare arcs. Bars stay readable at a dozen and compare exactly, which
// is what a breakdown is for.

export interface CategoryBar {
  key: string;
  label: string;
  value: number;
  tone?: ChartTone;
}

/** Sized so bars stay a comfortable thickness rather than stretching to fill. */
export function categoryBarsHeight(count: number): number {
  return Math.max(120, count * 28 + 24);
}

export function categoryBarsOption(bars: CategoryBar[], theme: ChartTheme): EChartsOption {
  // ECharts draws a value axis bottom-up, so the array is reversed to put the
  // largest bar at the TOP where a reader starts.
  const ordered = [...bars].reverse();

  return {
    grid: { left: 4, right: 56, top: 4, bottom: 4, containLabel: true },
    xAxis: {
      type: "value",
      show: false,
      // A whole-number axis: half an issue does not exist.
      minInterval: 1,
    },
    yAxis: {
      type: "category",
      data: ordered.map((b) => b.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: {
        color: theme.muted,
        fontSize: 12,
        // Long assignee names would otherwise push the plot area to nothing.
        width: 120,
        overflow: "truncate",
      },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.foreground, fontSize: 12 },
    },
    series: [
      {
        type: "bar",
        data: ordered.map((b) => ({
          value: b.value,
          itemStyle: { color: toneColor(theme, b.tone ?? "accent"), borderRadius: [0, 4, 4, 0] },
        })),
        barMaxWidth: 18,
        label: {
          show: true,
          position: "right",
          color: theme.muted,
          fontSize: 11,
        },
      },
    ],
  };
}

/** Screen-reader text: the chart's content as a sentence. */
export function categoryBarsSummary(bars: CategoryBar[]): string {
  if (bars.length === 0) return "No data.";
  return bars.map((b) => `${b.label}: ${b.value}`).join(". ");
}
