// Pure ECharts option builder for Velocity (ADR-0036 rule 3). No DOM, no
// React — so every display rule it enforces is unit-testable:
//   * zero-based axis (never scaled to the tallest bar)
//   * value labels on the bars, not only in a tooltip
//   * issue counts under the axis, readable on touch
//   * a dashed average line
import type { EChartsOption } from "../echarts-core";
import type { ChartTheme } from "../chart-theme";
import { mean, shortSeriesLabel } from "../geometry";

export interface VelocitySprint {
  name: string;
  points: number;
  issues: number;
}

// Room reserved on the right for the average callout, which sits OUTSIDE the
// plot area. Inside, it landed on top of the last bar's value label.
const AVERAGE_GUTTER = 72;

export function velocityOption(sprints: VelocitySprint[], theme: ChartTheme): EChartsOption {
  const average = mean(sprints.map((s) => s.points));
  const showsAverage = average !== null && average > 0;

  return {
    grid: {
      left: 8,
      right: showsAverage ? AVERAGE_GUTTER : 12,
      top: 24,
      bottom: 8,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: sprints.map((s) => s.name),
      axisLabel: {
        color: theme.muted,
        fontSize: 10,
        // Every sprint gets a label. ECharts hides alternate category labels
        // when it thinks they will not fit, which silently drops half the
        // x-axis — a bar with no name underneath is unreadable.
        interval: 0,
        // Two lines: the short sprint name, then its issue count. Keeping the
        // count out of the tooltip is deliberate — tooltips do not exist on
        // touch (docs/05_UI/03_Data_Visualisation.md rule 3).
        formatter: (value: string) => {
          const sprint = sprints.find((s) => s.name === value);
          const issues = sprint?.issues ?? 0;
          return `${shortSeriesLabel(value)}\n{sub|${issues} ${issues === 1 ? "issue" : "issues"}}`;
        },
        rich: { sub: { color: theme.muted, fontSize: 9, opacity: 0.75, padding: [2, 0, 0, 0] } },
      },
      axisLine: { lineStyle: { color: theme.border } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      // The axis always starts at zero, so a flat series of 5s can never look
      // like a flat series of 34s.
      min: 0,
      axisLabel: { color: theme.muted, fontSize: 10 },
      splitLine: { lineStyle: { color: theme.border, type: "dashed" } },
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: theme.surface,
      borderColor: theme.border,
      textStyle: { color: theme.foreground, fontSize: 11 },
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params : [params];
        const first = rows[0] as { name?: string } | undefined;
        const sprint = sprints.find((s) => s.name === first?.name);
        if (!sprint) return "";
        return `${sprint.name}<br/>${sprint.points} points · ${sprint.issues} issues`;
      },
    },
    series: [
      {
        type: "bar",
        name: "Story points",
        data: sprints.map((s) => s.points),
        itemStyle: { color: theme.accent, borderRadius: [3, 3, 0, 0] },
        // Stated explicitly rather than left to ECharts' default, which derives
        // the hover fill by lifting the base colour — and silently yields no
        // fill at all if that colour will not parse. A bar must never be able
        // to disappear on hover.
        emphasis: {
          itemStyle: {
            color: theme.accent,
            shadowBlur: 8,
            shadowColor: "rgba(0, 0, 0, 0.22)",
          },
        },
        barMaxWidth: 44,
        // Every bar carries its value, including a genuine zero — which is why
        // a 0-point sprint reads as "0" rather than an ambiguous sliver.
        label: {
          show: true,
          position: "top",
          color: theme.foreground,
          fontSize: 10,
          fontWeight: 500,
          // A value sitting close to the average would otherwise be struck
          // through by the dashed line.
          backgroundColor: theme.surface,
          padding: [1, 3],
          borderRadius: 2,
        },
        ...(showsAverage
          ? {
              markLine: {
                silent: true,
                symbol: "none",
                // No `opacity` here. In ECharts the markLine's lineStyle
                // opacity applies to the whole element *including its label*,
                // so 0.45 rendered the callout at 45% and it washed out —
                // exactly the "have to drain my eyes to read it" report. The
                // line is distinguished from gridlines by being dashed and
                // full-strength foreground, not by being faint.
                lineStyle: { color: theme.foreground, type: "dashed", width: 1 },
                label: {
                  formatter: `avg ${Math.round(average! * 10) / 10}`,
                  color: theme.foreground,
                  fontSize: 10,
                  fontWeight: 500,
                  // Outside the plot, in the gutter reserved above.
                  position: "end",
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  borderWidth: 1,
                  borderRadius: 3,
                  padding: [2, 5],
                },
                data: [{ yAxis: average }],
              },
            }
          : {}),
      },
    ],
  };
}

/** Screen-reader text; canvas exposes nothing on its own. */
export function velocitySummary(sprints: VelocitySprint[]): string {
  const average = mean(sprints.map((s) => s.points));
  return (
    `Bar chart of completed story points across ${sprints.length} ` +
    `${sprints.length === 1 ? "sprint" : "sprints"}: ` +
    sprints.map((s) => `${s.name} ${s.points} points from ${s.issues} issues`).join(", ") +
    (average !== null ? `. Average ${Math.round(average * 10) / 10} points.` : "")
  );
}
