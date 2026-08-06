// One horizontal stacked bar: how a population splits across a few categories
// (ADR-0036 rule 3). Pure — no DOM, no React, so every display rule below is
// unit-testable.
//
// Input is defined here rather than imported from a feature: `shared/` must not
// depend on `features/`, so callers map their DTO onto this shape.
import type { EChartsOption } from "../echarts-core";
import { toneColor, type ChartTheme, type ChartTone } from "../chart-theme";
import { percentOf } from "../geometry";

export interface DistributionSegment {
  key: string;
  label: string;
  count: number;
  tone: ChartTone;
}

// Below this share of the total a segment is too narrow to hold its own number
// legibly; the legend still carries it.
const MIN_INLINE_LABEL_SHARE = 0.08;

export function distributionBarOption(
  segments: DistributionSegment[],
  theme: ChartTheme,
): EChartsOption {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  // Zero-count categories stay in the legend — the full set of states is
  // information — but are dropped from the bar, where they draw nothing.
  const drawn = segments.filter((s) => s.count > 0);

  return {
    grid: { left: 0, right: 0, top: 0, bottom: 28, containLabel: false },
    // The bar IS the axis; ticks would add nothing to a part-of-whole read.
    xAxis: { type: "value", max: total || 1, show: true, axisLabel: { show: false },
             axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } },
    yAxis: { type: "category", data: [""], show: false },
    tooltip: {
      trigger: "item",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.foreground, fontSize: 11 },
      formatter: (params: unknown) => {
        const p = params as { seriesName?: string; value?: number };
        return `${p.seriesName}: ${p.value} (${percentOf(p.value ?? 0, total)}%)`;
      },
    },
    legend: {
      bottom: 0,
      left: 0,
      icon: "roundRect",
      itemWidth: 9,
      itemHeight: 9,
      itemGap: 14,
      textStyle: { color: theme.muted, fontSize: 11 },
      // Counts live in the legend, not only in a tooltip — tooltips do not
      // exist on touch (docs/05_UI/03_Data_Visualisation.md rule 3).
      formatter: (name: string) => {
        const segment = segments.find((s) => s.label === name);
        if (!segment) return name;
        return `${name}  ${segment.count}`;
      },
      data: segments.map((s) => s.label),
    },
    series: drawn.map((segment, index) => {
      const color = toneColor(theme, segment.tone);
      const share = total > 0 ? segment.count / total : 0;
      return {
        type: "bar" as const,
        name: segment.label,
        stack: "total",
        barWidth: 18,
        data: [segment.count],
        itemStyle: {
          color,
          // Square off the join between neighbours; round only the outer ends.
          borderRadius: outerRadius(index, drawn.length),
        },
        // Stated explicitly: ECharts otherwise derives the hover fill, which
        // yields no fill at all when a colour will not parse (rule 6).
        emphasis: { itemStyle: { color } },
        label: {
          show: share >= MIN_INLINE_LABEL_SHARE,
          position: "inside" as const,
          formatter: String(segment.count),
          fontSize: 10,
          fontWeight: 600,
          color: theme.surface,
        },
      };
    }),
  };
}

function outerRadius(index: number, length: number): number | number[] {
  if (length === 1) return 3;
  if (index === 0) return [3, 0, 0, 3];
  if (index === length - 1) return [0, 3, 3, 0];
  return 0;
}

/** Screen-reader text; a canvas exposes nothing on its own (rule 5). */
export function distributionBarSummary(segments: DistributionSegment[], noun: string): string {
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  if (total === 0) return `No ${noun} to show.`;
  return (
    `${total} ${noun} split by status: ` +
    segments
      .map((s) => `${s.label} ${s.count} (${percentOf(s.count, total)}%)`)
      .join(", ")
  );
}
