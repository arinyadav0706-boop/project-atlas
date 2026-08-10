import { describe, expect, it } from "vitest";
import { ringDonutOption, ringDonutSummary, type RingSegment } from "./ring-donut-option";
import { FALLBACK_CHART_THEME, toneColor } from "../chart-theme";

const theme = FALLBACK_CHART_THEME;

// 2 + 6 + 4 + 5 = 17 people, the mockup's team.
const segments: RingSegment[] = [
  { key: "OVERLOADED", label: "Overloaded", value: 2, tone: "danger" },
  { key: "BALANCED", label: "Balanced", value: 6, tone: "accent" },
  { key: "LIGHT", label: "Has room", value: 4, tone: "success" },
  { key: "IDLE", label: "No open work", value: 5, tone: "neutral" },
];

const center = { value: "17", label: "People" };

/* eslint-disable @typescript-eslint/no-explicit-any */
const asAny = (v: unknown) => v as any;

describe("ringDonutOption — the ring", () => {
  it("draws one slice per segment, in order, with its own tone", () => {
    const series = asAny(ringDonutOption(segments, center, theme)).series[0];
    expect(series.data.map((d: any) => d.name)).toEqual([
      "Overloaded",
      "Balanced",
      "Has room",
      "No open work",
    ]);
    expect(series.data.map((d: any) => d.itemStyle.color)).toEqual([
      toneColor(theme, "danger"),
      toneColor(theme, "accent"),
      toneColor(theme, "success"),
      toneColor(theme, "neutral"),
    ]);
  });

  it("is a ring, not a pie — the hole carries the headline figure", () => {
    const option = asAny(ringDonutOption(segments, center, theme));
    const [inner] = option.series[0].radius;
    expect(Number.parseFloat(inner)).toBeGreaterThan(0);
    expect(option.title.text).toBe("17");
    expect(option.title.subtext).toBe("People");
  });

  it("omits empty bands from the ring, where they would draw nothing", () => {
    const withEmpty = segments.map((s) =>
      s.key === "IDLE" ? { ...s, value: 0 } : s,
    );
    const series = asAny(ringDonutOption(withEmpty, center, theme)).series[0];
    expect(series.data.map((d: any) => d.name)).not.toContain("No open work");
    expect(series.data).toHaveLength(3);
  });

  it("carries no legend — the caller renders that in the DOM", () => {
    expect(asAny(ringDonutOption(segments, center, theme)).legend).toBeUndefined();
  });

  // Regression: emphasis must restate the fill. Left to ECharts it derives a
  // hover colour from the base and derives nothing when the base won't parse,
  // so the hovered slice disappears (see chart-theme.ts).
  it("restates each slice's fill under emphasis", () => {
    const series = asAny(ringDonutOption(segments, center, theme)).series[0];
    for (const slice of series.data) {
      expect(slice.emphasis.itemStyle.color).toBe(slice.itemStyle.color);
    }
  });

  it("percentages in the tooltip are of the whole team, including empty bands", () => {
    const option = asAny(ringDonutOption(segments, center, theme));
    // 6 of 17 = 35%.
    expect(option.tooltip.formatter({ name: "Balanced", value: 6 })).toBe("Balanced: 6 (35%)");
  });
});

describe("ringDonutSummary", () => {
  it("states every band with its share, so the canvas is not the only source", () => {
    expect(ringDonutSummary(segments, center)).toBe(
      "17 people: Overloaded 2 (12%), Balanced 6 (35%), Has room 4 (24%), No open work 5 (29%)",
    );
  });

  it("says so plainly when there is nothing to draw", () => {
    expect(ringDonutSummary([], center)).toBe("No people to show.");
  });
});
