// Horizontal bars measured against capacity thresholds (ADR-0036 rule 3):
// one bar per person, a real value axis in weeks, and reference lines at the
// thresholds that define the status bands. Pure and unit-tested.
//
// This is what the CSS mini-bars could not do: those were scaled to a fixed
// 2-week width with no ticks, so "how full is this" was unreadable and two
// people could not be compared across status groups.
import type { EChartsOption } from "../echarts-core";
import { toneColor, type ChartTheme, type ChartTone } from "../chart-theme";

export interface CapacityBar {
  key: string;
  label: string;
  /** Weeks of queued work. 0 is a real value — someone with nothing to do. */
  weeks: number;
  tone: ChartTone;
  /** Right-hand annotation, e.g. "18h · 6 issues" or "no open work". */
  caption: string;
}

export interface CapacityReference {
  weeks: number;
  label: string;
}

const ROW_HEIGHT = 26;
const CHROME_HEIGHT = 58;
const MIN_AXIS_WEEKS = 2.5;
const NAME_MAX_CHARS = 18;
// Below the series' default z of 2, so threshold lines sit behind the data.
const MARKLINE_Z = 1;

/** Height the chart container needs for this many bars. */
export function capacityBarsHeight(count: number): number {
  return Math.max(120, count * ROW_HEIGHT + CHROME_HEIGHT);
}

function roundUpToHalf(value: number): number {
  return Math.ceil(value * 2) / 2;
}

export function capacityBarsOption(
  bars: CapacityBar[],
  references: CapacityReference[],
  theme: ChartTheme,
): EChartsOption {
  const busiest = bars.reduce((max, b) => Math.max(max, b.weeks), 0);
  const highestReference = references.reduce((max, r) => Math.max(max, r.weeks), 0);
  // The axis always spans far enough to show every reference line, so the
  // "2 weeks" mark never falls off the right edge of a quiet team. Rounded up
  // to a half week: an exact 1.15× of the busiest person produced tick labels
  // like "3.91 wk", which reads as noise.
  const axisMax = roundUpToHalf(
    Math.max(MIN_AXIS_WEEKS, highestReference * 1.25, busiest * 1.15),
  );

  return {
    // `top` reserves the strip the threshold chips sit in; without it they are
    // clipped by the top edge of the canvas.
    grid: { left: 4, right: 82, top: 22, bottom: 24, containLabel: true },
    xAxis: {
      type: "value",
      min: 0,
      max: Number(axisMax.toFixed(2)),
      axisLabel: {
        color: theme.muted,
        fontSize: 10,
        formatter: (value: number) => `${value} wk`,
      },
      splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
    },
    yAxis: {
      type: "category",
      // Most loaded at the top, matching the row order below the chart.
      inverse: true,
      data: bars.map((b) => b.label),
      axisLabel: {
        color: theme.foreground,
        fontSize: 11,
        // Every person keeps a label; ECharts otherwise hides alternate
        // categories when it thinks they will not fit, silently dropping names.
        interval: 0,
        formatter: (value: string) =>
          value.length > NAME_MAX_CHARS ? `${value.slice(0, NAME_MAX_CHARS - 1)}…` : value,
      },
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { show: false },
    },
    tooltip: {
      trigger: "item",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.foreground, fontSize: 11 },
      formatter: (params: unknown) => {
        const p = params as { dataIndex?: number };
        const bar = bars[p.dataIndex ?? -1];
        if (!bar) return "";
        return `${bar.label}<br/>${bar.weeks} wk · ${bar.caption}`;
      },
    },
    series: [
      {
        type: "bar",
        name: "Weeks queued",
        barMaxWidth: 14,
        data: bars.map((bar) => {
          const color = toneColor(theme, bar.tone);
          return {
            value: bar.weeks,
            itemStyle: { color, borderRadius: [0, 3, 3, 0] },
            // Explicit, so a bar can never render unfilled on hover (rule 6).
            emphasis: { itemStyle: { color } },
          };
        }),
        // The caption sits outside the bar, so a zero-length bar still says
        // what it means rather than looking like missing data.
        label: {
          show: true,
          position: "right",
          distance: 6,
          fontSize: 10,
          color: theme.muted,
          // Backed, so a threshold line crossing the caption cannot strike
          // through it — a bar ending near 2 wk puts its caption right on the line.
          backgroundColor: theme.surface,
          padding: [1, 3],
          borderRadius: 2,
          formatter: (params: { dataIndex: number }) => bars[params.dataIndex]?.caption ?? "",
        },
        markLine: {
          silent: true,
          symbol: "none",
          // Behind the bars and their captions. A markLine defaults to drawing
          // above the series, and a vertical threshold crossing a caption
          // struck the text out ("76h · 14 issues" with a line through it).
          // The chips keep their own z, so they stay legible at the top.
          z: MARKLINE_Z,
          // No `opacity` — on a markLine it fades the label with the line.
          lineStyle: { color: theme.foreground, type: "dashed", width: 1 },
          label: {
            color: theme.foreground,
            fontSize: 9,
            fontWeight: 500,
            // Top of the plot. At the bottom these chips sat on the axis tick
            // labels and the two collided.
            position: "start",
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 3,
            padding: [1, 4],
            formatter: (params: { name?: string }) => params.name ?? "",
          },
          // No filtering needed: axisMax is derived from the highest reference,
          // so every threshold is inside the axis by construction.
          data: references.map((r) => ({ xAxis: r.weeks, name: r.label })),
        },
      },
    ],
  };
}

/** Screen-reader text; a canvas exposes nothing on its own (rule 5). */
export function capacityBarsSummary(bars: CapacityBar[]): string {
  if (bars.length === 0) return "Nobody to show.";
  return (
    `Weeks of queued work for ${bars.length} ${bars.length === 1 ? "person" : "people"}, ` +
    `most loaded first: ` +
    bars.map((b) => `${b.label} ${b.weeks} weeks, ${b.caption}`).join("; ")
  );
}
