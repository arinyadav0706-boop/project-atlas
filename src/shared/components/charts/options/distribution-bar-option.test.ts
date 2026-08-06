import { describe, expect, it } from "vitest";
import {
  distributionBarOption,
  distributionBarSummary,
  type DistributionSegment,
} from "./distribution-bar-option";
import { FALLBACK_CHART_THEME, toneColor } from "../chart-theme";

const theme = FALLBACK_CHART_THEME;

// 4 + 9 + 5 + 2 = 20 people.
const segments: DistributionSegment[] = [
  { key: "OVERLOADED", label: "Overloaded", count: 4, tone: "danger" },
  { key: "BALANCED", label: "Balanced", count: 9, tone: "accent" },
  { key: "LIGHT", label: "Has room", count: 5, tone: "success" },
  { key: "IDLE", label: "No open work", count: 2, tone: "neutral" },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
const asAny = (v: unknown) => v as any;

describe("distributionBarOption — the bar", () => {
  it("stacks one series per non-empty category into a single bar", () => {
    const option = asAny(distributionBarOption(segments, theme));
    expect(option.series).toHaveLength(4);
    expect(option.series.every((s: any) => s.stack === "total")).toBe(true);
    expect(option.yAxis.data).toEqual([""]);
  });

  it("spans exactly the total, so the bar reads as a whole", () => {
    const option = asAny(distributionBarOption(segments, theme));
    expect(option.xAxis.max).toBe(20);
  });

  it("keeps the segment order given, not size order", () => {
    const option = asAny(distributionBarOption(segments, theme));
    expect(option.series.map((s: any) => s.name)).toEqual([
      "Overloaded",
      "Balanced",
      "Has room",
      "No open work",
    ]);
  });

  it("colours each segment from its semantic tone", () => {
    const option = asAny(distributionBarOption(segments, theme));
    expect(option.series[0].itemStyle.color).toBe(toneColor(theme, "danger"));
    expect(option.series[2].itemStyle.color).toBe(toneColor(theme, "success"));
  });

  it("rounds only the outer ends of the stack", () => {
    const option = asAny(distributionBarOption(segments, theme));
    expect(option.series[0].itemStyle.borderRadius).toEqual([3, 0, 0, 3]);
    expect(option.series[1].itemStyle.borderRadius).toBe(0);
    expect(option.series[3].itemStyle.borderRadius).toEqual([0, 3, 3, 0]);
  });

  it("rounds both ends when a single category holds everyone", () => {
    const only = [segments[1]!];
    expect(asAny(distributionBarOption(only, theme)).series[0].itemStyle.borderRadius).toBe(3);
  });
});

describe("distributionBarOption — empty categories", () => {
  const withGap: DistributionSegment[] = [
    { key: "OVERLOADED", label: "Overloaded", count: 0, tone: "danger" },
    { key: "BALANCED", label: "Balanced", count: 7, tone: "accent" },
  ];

  it("draws nothing for a zero count", () => {
    const option = asAny(distributionBarOption(withGap, theme));
    expect(option.series.map((s: any) => s.name)).toEqual(["Balanced"]);
  });

  it("still lists the empty category in the legend — the full set is information", () => {
    const option = asAny(distributionBarOption(withGap, theme));
    expect(option.legend.data).toEqual(["Overloaded", "Balanced"]);
    expect(option.legend.formatter("Overloaded")).toContain("0");
  });

  it("does not divide by zero when every category is empty", () => {
    const empty = segments.map((s) => ({ ...s, count: 0 }));
    const option = asAny(distributionBarOption(empty, theme));
    expect(option.series).toEqual([]);
    expect(option.xAxis.max).toBe(1);
  });
});

describe("distributionBarOption — labels", () => {
  it("prints the count inside a segment wide enough to hold it", () => {
    const option = asAny(distributionBarOption(segments, theme));
    expect(option.series[1].label.show).toBe(true); // 9/20 = 45%
    expect(option.series[1].label.formatter).toBe("9");
  });

  it("suppresses the inline number on a sliver, leaving it to the legend", () => {
    const skewed: DistributionSegment[] = [
      { key: "A", label: "A", count: 199, tone: "accent" },
      { key: "B", label: "B", count: 1, tone: "danger" },
    ];
    const option = asAny(distributionBarOption(skewed, theme));
    expect(option.series[1].label.show).toBe(false);
    expect(option.legend.formatter("B")).toContain("1");
  });

  it("states the emphasis fill so a segment cannot blank out on hover", () => {
    const option = asAny(distributionBarOption(segments, theme));
    for (const s of option.series) {
      expect(s.emphasis.itemStyle.color).toBe(s.itemStyle.color);
    }
  });

  it("uses no hard-coded hex", () => {
    expect(JSON.stringify(distributionBarOption(segments, theme))).not.toMatch(
      /#[0-9a-f]{3,8}\b/i,
    );
  });
});

describe("distributionBarSummary", () => {
  it("states every category with its count and share", () => {
    const summary = distributionBarSummary(segments, "people");
    expect(summary).toContain("20 people");
    expect(summary).toContain("Overloaded 4 (20%)");
    expect(summary).toContain("No open work 2 (10%)");
  });

  it("says so plainly when there is nothing", () => {
    expect(distributionBarSummary([], "people")).toBe("No people to show.");
  });
});
