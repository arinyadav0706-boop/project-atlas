// Sprint burndown: remaining work against an ideal reference line (ADR-0037).
// The kit's first `line` chart, built to §5 of the visualisation doc — an
// ideal/actual pair, dots on every data point, a today marker, and a real
// zero-based axis. Pure and unit-tested.
import type { EChartsOption } from "../echarts-core";
import { toneColor, type ChartTheme } from "../chart-theme";

export type BurndownAxisUnit = "points" | "issues" | "hours";

export interface BurndownDatum {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  remaining: number;
  ideal: number;
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2026-08-03" → "Aug 3". Parsed as UTC so the label never shifts a day. */
export function burndownDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return `${SHORT_MONTHS[m - 1]} ${d}`;
}

/** Axis and tooltip formatting per unit. Hours arrive as minutes. */
export function formatBurndownValue(value: number, unit: BurndownAxisUnit): string {
  if (unit === "hours") {
    const hours = value / 60;
    return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  }
  if (unit === "points") return `${Math.round(value * 10) / 10} pts`;
  return `${value}`;
}

export function burndownUnitLabel(unit: BurndownAxisUnit): string {
  if (unit === "hours") return "Remaining hours";
  if (unit === "points") return "Remaining story points";
  return "Remaining issues";
}

export function burndownSummary(data: BurndownDatum[], unit: BurndownAxisUnit): string {
  if (data.length === 0) return "No days to plot.";
  const first = data[0]!;
  const last = data[data.length - 1]!;
  const done = first.remaining - last.remaining;
  return (
    `${burndownUnitLabel(unit)} from ${formatBurndownValue(first.remaining, unit)} on ` +
    `${burndownDayLabel(first.day)} to ${formatBurndownValue(last.remaining, unit)} on ` +
    `${burndownDayLabel(last.day)}; ${formatBurndownValue(Math.max(done, 0), unit)} burned down ` +
    `across ${data.length} ${data.length === 1 ? "day" : "days"}.`
  );
}

export function burndownLineOption(
  data: BurndownDatum[],
  unit: BurndownAxisUnit,
  theme: ChartTheme,
  todayIso?: string,
): EChartsOption {
  const accent = toneColor(theme, "accent");
  // The ideal is a reference, not a second dataset competing for attention.
  const idealColor = theme.muted;
  const todayIndex = todayIso ? data.findIndex((d) => d.day === todayIso) : -1;

  return {
    grid: { left: 8, right: 16, top: 28, bottom: 24, containLabel: true },
    legend: {
      show: true,
      top: 0,
      right: 0,
      itemWidth: 18,
      itemHeight: 8,
      textStyle: { color: theme.muted, fontSize: 10 },
      data: ["Remaining", "Ideal"],
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: data.map((d) => burndownDayLabel(d.day)),
      axisLabel: {
        color: theme.muted,
        fontSize: 10,
        // A 4-week sprint is 28 labels; let ECharts thin them rather than
        // overlap, but never drop the first one.
        showMinLabel: true,
      },
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      // Zero-baseline, never truncated to exaggerate the drop (§4 rule 1).
      min: 0,
      axisLabel: {
        color: theme.muted,
        fontSize: 10,
        formatter: (value: number) => formatBurndownValue(value, unit),
      },
      splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.foreground, fontSize: 11 },
      formatter: (params: unknown) => {
        const rows = params as { dataIndex?: number }[];
        const index = rows?.[0]?.dataIndex ?? -1;
        const d = data[index];
        if (!d) return "";
        return (
          `${burndownDayLabel(d.day)}<br/>` +
          `Remaining: ${formatBurndownValue(d.remaining, unit)}<br/>` +
          `Ideal: ${formatBurndownValue(d.ideal, unit)}`
        );
      },
    },
    series: [
      {
        name: "Ideal",
        type: "line",
        data: data.map((d) => d.ideal),
        symbol: "none",
        lineStyle: { color: idealColor, type: "dashed", width: 1 },
        itemStyle: { color: idealColor },
        // Behind the real line: the reference must never obscure the fact.
        z: 1,
      },
      {
        name: "Remaining",
        type: "line",
        data: data.map((d) => d.remaining),
        // Dots on every point (§5): a burndown is read day by day, and a bare
        // polyline hides which days actually carry a reading.
        symbol: "circle",
        symbolSize: 5,
        lineStyle: { color: accent, width: 2 },
        itemStyle: { color: accent },
        // Explicit, so hover cannot render the marker unfilled (ADR-0036 rule 6).
        emphasis: { itemStyle: { color: accent, borderColor: accent } },
        z: 2,
        markLine:
          todayIndex >= 0
            ? {
                silent: true,
                symbol: "none",
                lineStyle: { color: theme.foreground, type: "dotted", width: 1 },
                label: {
                  show: true,
                  formatter: "today",
                  color: theme.muted,
                  fontSize: 9,
                  position: "insideEndTop",
                  // ECharts rotates a vertical markLine's label to run along
                  // the line, which reads as sideways text on a chart where
                  // every other label is horizontal.
                  rotate: 0,
                },
                data: [{ xAxis: todayIndex }],
              }
            : undefined,
      },
    ],
  };
}
