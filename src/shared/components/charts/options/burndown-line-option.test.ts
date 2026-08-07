import { describe, expect, it } from "vitest";
import {
  burndownDayLabel,
  burndownLineOption,
  burndownSummary,
  burndownUnitLabel,
  formatBurndownValue,
  type BurndownDatum,
} from "./burndown-line-option";
import { FALLBACK_CHART_THEME } from "../chart-theme";

const theme = FALLBACK_CHART_THEME;
const data: BurndownDatum[] = [
  { day: "2026-08-03", remaining: 40, ideal: 40 },
  { day: "2026-08-04", remaining: 34, ideal: 20 },
  { day: "2026-08-05", remaining: 12, ideal: 0 },
];

describe("burndownDayLabel reads as a calendar date", () => {
  it("formats a UTC day without shifting it", () => {
    expect(burndownDayLabel("2026-08-03")).toBe("Aug 3");
    expect(burndownDayLabel("2026-12-31")).toBe("Dec 31");
  });

  it("passes through anything it cannot parse rather than printing NaN", () => {
    expect(burndownDayLabel("not-a-day")).toBe("not-a-day");
  });
});

describe("formatBurndownValue labels each unit honestly", () => {
  it("converts the hours axis from minutes", () => {
    expect(formatBurndownValue(120, "hours")).toBe("2h");
    expect(formatBurndownValue(90, "hours")).toBe("1.5h");
  });

  it("keeps points readable", () => {
    expect(formatBurndownValue(12, "points")).toBe("12 pts");
  });

  it("leaves an issue count bare", () => {
    expect(formatBurndownValue(7, "issues")).toBe("7");
  });
});

describe("burndownLineOption", () => {
  const option = burndownLineOption(data, "points", theme, "2026-08-04");

  it("plots the real line and the ideal as separate series", () => {
    const series = option.series as { name: string; data: number[] }[];
    expect(series.map((s) => s.name)).toEqual(["Ideal", "Remaining"]);
    expect(series[1]!.data).toEqual([40, 34, 12]);
    expect(series[0]!.data).toEqual([40, 20, 0]);
  });

  it("starts the value axis at zero — never truncated to exaggerate a drop", () => {
    expect((option.yAxis as { min: number }).min).toBe(0);
  });

  it("draws dots on every data point, so each day is visibly a reading", () => {
    const series = option.series as { name: string; symbol?: string }[];
    expect(series[1]!.symbol).toBe("circle");
  });

  it("keeps the ideal behind the real line", () => {
    const series = option.series as { name: string; z?: number }[];
    expect(series[0]!.z).toBeLessThan(series[1]!.z!);
  });

  it("marks today when it falls inside the sprint", () => {
    const series = option.series as { markLine?: { data: { xAxis: number }[] } }[];
    expect(series[1]!.markLine?.data[0]?.xAxis).toBe(1);
  });

  it("omits the today marker for a sprint that has already finished", () => {
    const past = burndownLineOption(data, "points", theme, "2026-09-01");
    const series = past.series as { markLine?: unknown }[];
    expect(series[1]!.markLine).toBeUndefined();
  });

  it("labels the x axis with real dates", () => {
    expect((option.xAxis as { data: string[] }).data).toEqual(["Aug 3", "Aug 4", "Aug 5"]);
  });
});

describe("burndownSummary gives a screen reader the whole story", () => {
  it("states start, end and how much burned down", () => {
    const summary = burndownSummary(data, "points");
    expect(summary).toContain("40 pts");
    expect(summary).toContain("12 pts");
    expect(summary).toContain("Aug 3");
    expect(summary).toContain("3 days");
  });

  it("says so when there is nothing to plot", () => {
    expect(burndownSummary([], "points")).toBe("No days to plot.");
  });

  it("never reports a negative burn-down when work was added back", () => {
    const reopened: BurndownDatum[] = [
      { day: "2026-08-03", remaining: 10, ideal: 10 },
      { day: "2026-08-04", remaining: 14, ideal: 0 },
    ];
    expect(burndownSummary(reopened, "issues")).toContain("0 burned down");
  });
});

describe("burndownUnitLabel", () => {
  it("names each unit", () => {
    expect(burndownUnitLabel("points")).toBe("Remaining story points");
    expect(burndownUnitLabel("issues")).toBe("Remaining issues");
    expect(burndownUnitLabel("hours")).toBe("Remaining hours");
  });
});
