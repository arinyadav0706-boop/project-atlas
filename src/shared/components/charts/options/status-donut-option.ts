// Pure ECharts option builder for the status breakdown donut (ADR-0036 rule 3).
import type { EChartsOption } from "../echarts-core";
import { toneColor, type ChartTheme, type ChartTone } from "../chart-theme";
import { percentOf } from "../geometry";

export interface StatusSegment {
  status: string;
  label: string;
  count: number;
  tone: ChartTone;
}

export function statusDonutOption(
  segments: StatusSegment[],
  total: number,
  theme: ChartTheme,
): EChartsOption {
  // Zero-count statuses stay in the legend (so the workflow is complete) but
  // are dropped from the ring, where they would render nothing.
  const drawn = segments.filter((s) => s.count > 0);

  return {
    // The centre total, positioned by ECharts rather than hand-placed text.
    title: {
      text: String(total),
      subtext: "issues",
      left: "30%",
      top: "center",
      textAlign: "center",
      textStyle: { color: theme.foreground, fontSize: 20, fontWeight: 600 },
      subtextStyle: { color: theme.muted, fontSize: 10 },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.foreground, fontSize: 11 },
      formatter: (params: unknown) => {
        const p = params as { name?: string; value?: number };
        return `${p.name}: ${p.value} (${percentOf(p.value ?? 0, total)}%)`;
      },
    },
    legend: {
      orient: "vertical",
      right: 0,
      top: "center",
      icon: "roundRect",
      itemWidth: 10,
      itemHeight: 10,
      textStyle: { color: theme.muted, fontSize: 11 },
      // Absolute value AND percentage in the legend — the numbers must be
      // readable without hovering (rule 3).
      formatter: (name: string) => {
        const segment = segments.find((s) => s.label === name);
        if (!segment) return name;
        return `${name}  ${segment.count}  ${percentOf(segment.count, total)}%`;
      },
      data: segments.map((s) => s.label),
    },
    series: [
      {
        type: "pie",
        // Donut, not pie: the hole carries the total.
        radius: ["58%", "80%"],
        center: ["30%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: theme.surface, borderWidth: 2 },
        label: { show: false },
        labelLine: { show: false },
        // Grow slightly on hover instead of recolouring. Each segment restates
        // its own fill so emphasis never falls back to ECharts' derived colour,
        // which yields nothing at all when the base colour will not parse — the
        // segment would blank out under the cursor.
        emphasis: { scale: true, scaleSize: 4 },
        data: drawn.map((s) => {
          const color = toneColor(theme, s.tone);
          return {
            name: s.label,
            value: s.count,
            itemStyle: { color },
            emphasis: { itemStyle: { color, borderColor: theme.surface, borderWidth: 2 } },
          };
        }),
      },
    ],
  };
}

export function statusDonutSummary(segments: StatusSegment[], total: number): string {
  return (
    `Donut chart of ${total} issues by status: ` +
    segments
      .map((s) => `${s.label} ${s.count} (${percentOf(s.count, total)}%)`)
      .join(", ")
  );
}
