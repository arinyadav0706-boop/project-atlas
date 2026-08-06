import { describe, expect, it } from "vitest";
import { velocityOption, velocitySummary, type VelocitySprint } from "./velocity-option";
import { FALLBACK_CHART_THEME } from "../chart-theme";

// The option object IS the chart. Asserting on it is how the display rules in
// docs/05_UI/03_Data_Visualisation.md stay enforced now that ECharts owns the
// rendering — the same rules the in-house kit's geometry tests protected.

const theme = FALLBACK_CHART_THEME;
const sprints: VelocitySprint[] = [
  { name: "VWP Sprint 1", points: 34, issues: 12 },
  { name: "VWP Sprint 2", points: 21, issues: 9 },
  { name: "VWP Sprint 3", points: 0, issues: 0 },
];

// ECharts option fields are loosely typed unions; these narrow for assertions.
/* eslint-disable @typescript-eslint/no-explicit-any */
const asAny = (v: unknown) => v as any;

describe("velocityOption — axis rules", () => {
  it("pins the value axis to zero so a flat series cannot look full (rule 1)", () => {
    const option = asAny(velocityOption(sprints, theme));
    expect(option.yAxis.min).toBe(0);
  });

  it("keeps the same zero baseline for a low series as for a high one", () => {
    const low = asAny(velocityOption([{ name: "S1", points: 5, issues: 1 }], theme));
    const high = asAny(velocityOption([{ name: "S1", points: 500, issues: 1 }], theme));
    expect(low.yAxis.min).toBe(0);
    expect(high.yAxis.min).toBe(0);
  });

  it("draws gridlines rather than leaving bars floating (rule 2)", () => {
    const option = asAny(velocityOption(sprints, theme));
    expect(option.yAxis.splitLine.lineStyle.color).toBe(theme.border);
  });
});

describe("velocityOption — the data itself", () => {
  it("plots one bar per sprint, in the order given", () => {
    const option = asAny(velocityOption(sprints, theme));
    expect(option.series[0].data).toEqual([34, 21, 0]);
    expect(option.xAxis.data).toEqual(sprints.map((s) => s.name));
  });

  it("shows a value label on every bar, so nothing is tooltip-only (rule 3)", () => {
    const option = asAny(velocityOption(sprints, theme));
    expect(option.series[0].label.show).toBe(true);
  });

  it("puts issue counts under the axis, where touch users can read them", () => {
    const option = asAny(velocityOption(sprints, theme));
    const label = option.xAxis.axisLabel.formatter("VWP Sprint 1");
    expect(label).toContain("S1");
    expect(label).toContain("12 issues");
  });

  it("singularises a one-issue sprint", () => {
    const option = asAny(velocityOption([{ name: "Sprint 4", points: 3, issues: 1 }], theme));
    expect(option.xAxis.axisLabel.formatter("Sprint 4")).toContain("1 issue");
  });

  it("labels a genuine zero sprint as 0 rather than hiding it", () => {
    const option = asAny(velocityOption(sprints, theme));
    expect(option.series[0].data[2]).toBe(0);
    expect(option.xAxis.axisLabel.formatter("VWP Sprint 3")).toContain("0 issues");
  });
});

describe("velocityOption — the average line (rule: velocity shows a trend)", () => {
  it("adds a dashed average line at the mean", () => {
    const option = asAny(velocityOption(sprints, theme));
    const markLine = option.series[0].markLine;
    expect(markLine).toBeDefined();
    // (34 + 21 + 0) / 3
    expect(markLine.data[0].yAxis).toBeCloseTo(18.333, 3);
    expect(markLine.lineStyle.type).toBe("dashed");
    expect(markLine.label.formatter).toBe("avg 18.3");
  });

  it("omits the line when every sprint scored zero — an average of 0 is noise", () => {
    const option = asAny(
      velocityOption([{ name: "S1", points: 0, issues: 0 }], theme),
    );
    expect(option.series[0].markLine).toBeUndefined();
  });
});

describe("velocityOption — theming (no hex anywhere)", () => {
  it("takes every colour from the supplied theme", () => {
    const custom = { ...theme, accent: "hsl(1 2% 3%)", border: "hsl(4 5% 6%)" };
    const option = asAny(velocityOption(sprints, custom));
    expect(option.series[0].itemStyle.color).toBe("hsl(1 2% 3%)");
    expect(option.yAxis.splitLine.lineStyle.color).toBe("hsl(4 5% 6%)");
  });

  it("serialises with no hard-coded hex colour", () => {
    const json = JSON.stringify(velocityOption(sprints, theme));
    expect(json).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });
});

// Regression: with no explicit emphasis, ECharts derives the hover fill by
// lifting the base colour — and produces *no fill* when that colour will not
// parse, so the hovered bar vanished. See chart-theme.test.ts for the root
// cause; this asserts the belt-and-braces half of the fix.
describe("velocityOption — hover can never blank a bar", () => {
  it("states the emphasis fill explicitly instead of letting ECharts derive it", () => {
    const option = asAny(velocityOption(sprints, theme));
    expect(option.series[0].emphasis.itemStyle.color).toBe(theme.accent);
  });

  it("keeps the emphasis fill identical to the resting fill", () => {
    const option = asAny(velocityOption(sprints, theme));
    expect(option.series[0].emphasis.itemStyle.color).toBe(option.series[0].itemStyle.color);
  });

  it("follows a custom theme into emphasis too", () => {
    const custom = { ...theme, accent: "hsl(9, 8%, 7%)" };
    const option = asAny(velocityOption(sprints, custom));
    expect(option.series[0].emphasis.itemStyle.color).toBe("hsl(9, 8%, 7%)");
  });
});

describe("velocityOption — the average label is readable", () => {
  it("sits on a filled chip rather than bare over the plot area", () => {
    const label = asAny(velocityOption(sprints, theme)).series[0].markLine.label;
    expect(label.backgroundColor).toBe(theme.surface);
    expect(label.color).toBe(theme.foreground);
    expect(label.borderColor).toBe(theme.border);
  });

  it("still omits the line entirely when the average is zero (rule 4)", () => {
    const zeros = sprints.map((s) => ({ ...s, points: 0 }));
    expect(asAny(velocityOption(zeros, theme)).series[0].markLine).toBeUndefined();
  });
});

describe("velocitySummary — the accessible text", () => {
  it("states every sprint, its points and its issue count", () => {
    const summary = velocitySummary(sprints);
    expect(summary).toContain("VWP Sprint 1 34 points from 12 issues");
    expect(summary).toContain("Average 18.3 points");
  });

  it("handles a single sprint without saying 'sprints'", () => {
    expect(velocitySummary([{ name: "S1", points: 5, issues: 2 }])).toContain("1 sprint:");
  });
});
