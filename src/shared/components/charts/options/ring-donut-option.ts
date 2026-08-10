// A ring with a headline figure in the hole, and nothing else (ADR-0036 rule 3).
//
// Deliberately legend-less, which is the whole difference from
// `status-donut-option`. ECharts' legend lays its columns out with spaces, so
// "Overloaded 2 12%" and "No open work 5 29%" do not line up — and three
// ragged columns is exactly what the eye reads as sloppy. The caller renders
// the legend in the DOM beside the canvas, where a grid aligns it, and the
// canvas is left doing the one thing only a canvas can do: draw the ring.
import type { EChartsOption } from "../echarts-core";
import { toneColor, type ChartTheme, type ChartTone } from "../chart-theme";
import { percentOf } from "../geometry";

export interface RingSegment {
  key: string;
  label: string;
  value: number;
  tone: ChartTone;
}

export interface RingCenter {
  /** Pre-formatted: the builder does not know whether this counts people or hours. */
  value: string;
  label: string;
}

export function ringDonutOption(
  segments: RingSegment[],
  center: RingCenter,
  theme: ChartTheme,
): EChartsOption {
  // A zero-value segment draws nothing but still occupies a slot in ECharts'
  // colour cycle and its tooltip; the DOM legend keeps showing it, so the band
  // is never silently dropped from the vocabulary.
  const drawn = segments.filter((s) => s.value > 0);
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  return {
    title: {
      text: center.value,
      subtext: center.label,
      left: "center",
      top: "center",
      textAlign: "center",
      // `top: center` positions the title block's top edge at the middle, so
      // the two lines hang below centre. Shifting up by roughly one line's
      // half-height puts the pair on the ring's axis instead.
      textVerticalAlign: "middle",
      itemGap: 2,
      textStyle: { color: theme.foreground, fontSize: 26, fontWeight: 600 },
      subtextStyle: { color: theme.muted, fontSize: 11 },
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
    series: [
      {
        type: "pie",
        radius: ["66%", "88%"],
        center: ["50%", "50%"],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: theme.surface, borderWidth: 3 },
        label: { show: false },
        labelLine: { show: false },
        // Each segment restates its own fill under emphasis. ECharts otherwise
        // derives a hover colour from the base, and derives nothing at all when
        // the base will not parse — the segment blanks out under the cursor.
        emphasis: { scale: true, scaleSize: 4 },
        data: drawn.map((s) => {
          const color = toneColor(theme, s.tone);
          return {
            name: s.label,
            value: s.value,
            itemStyle: { color },
            emphasis: { itemStyle: { color, borderColor: theme.surface, borderWidth: 3 } },
          };
        }),
      },
    ],
  };
}

/** Screen-reader text; a canvas exposes nothing on its own (rule 5). */
export function ringDonutSummary(segments: RingSegment[], center: RingCenter): string {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return `No ${center.label.toLowerCase()} to show.`;
  return (
    `${center.value} ${center.label.toLowerCase()}: ` +
    segments
      .map((s) => `${s.label} ${s.value} (${percentOf(s.value, total)}%)`)
      .join(", ")
  );
}
