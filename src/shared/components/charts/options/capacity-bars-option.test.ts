import { describe, expect, it } from "vitest";
import {
  capacityBarsHeight,
  capacityBarsOption,
  capacityBarsSummary,
  type CapacityBar,
  type CapacityReference,
} from "./capacity-bars-option";
import { FALLBACK_CHART_THEME, toneColor } from "../chart-theme";

const theme = FALLBACK_CHART_THEME;

const REFERENCES: CapacityReference[] = [
  { weeks: 1, label: "1 wk" },
  { weeks: 2, label: "2 wk" },
];

const bars: CapacityBar[] = [
  { key: "u1", label: "Daniel Ahmed", weeks: 3.4, tone: "danger", caption: "136h · 21 issues" },
  { key: "u2", label: "Priya Nair", weeks: 1.2, tone: "accent", caption: "48h · 9 issues" },
  { key: "u3", label: "Sam Okonkwo", weeks: 0.2, tone: "success", caption: "8h · 2 issues" },
  { key: "u4", label: "Lea Fischer", weeks: 0, tone: "neutral", caption: "no open work" },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
const asAny = (v: unknown) => v as any;

describe("capacityBarsOption — the axis is real", () => {
  it("starts at zero so bars are comparable", () => {
    expect(asAny(capacityBarsOption(bars, REFERENCES, theme)).xAxis.min).toBe(0);
  });

  it("labels the axis in weeks rather than leaving bare numbers", () => {
    const format = asAny(capacityBarsOption(bars, REFERENCES, theme)).xAxis.axisLabel.formatter;
    expect(format(2)).toBe("2 wk");
  });

  it("always spans far enough to show every reference line", () => {
    // A team where nobody has any work must still show the 1 and 2 week marks.
    const quiet = bars.map((b) => ({ ...b, weeks: 0 }));
    const option = asAny(capacityBarsOption(quiet, REFERENCES, theme));
    expect(option.xAxis.max).toBeGreaterThanOrEqual(2);
    expect(option.series[0].markLine.data).toHaveLength(2);
  });

  it("grows past the references when someone is far over", () => {
    const buried = [{ ...bars[0]!, weeks: 12 }];
    expect(asAny(capacityBarsOption(buried, REFERENCES, theme)).xAxis.max).toBeGreaterThan(12);
  });

  it("keeps every person's name — no silent alternate-label hiding", () => {
    const option = asAny(capacityBarsOption(bars, REFERENCES, theme));
    expect(option.yAxis.axisLabel.interval).toBe(0);
    expect(option.yAxis.data).toHaveLength(4);
  });

  it("puts the most loaded person at the top", () => {
    const option = asAny(capacityBarsOption(bars, REFERENCES, theme));
    expect(option.yAxis.inverse).toBe(true);
    expect(option.yAxis.data[0]).toBe("Daniel Ahmed");
  });

  it("truncates a very long name instead of letting it eat the plot", () => {
    const format = asAny(capacityBarsOption(bars, REFERENCES, theme)).yAxis.axisLabel.formatter;
    expect(format("Bartholomew Featherstonehaugh")).toBe("Bartholomew Feath…");
    expect(format("Priya Nair")).toBe("Priya Nair");
  });
});

describe("capacityBarsOption — reference lines", () => {
  it("draws a dashed line at each threshold, labelled", () => {
    const markLine = asAny(capacityBarsOption(bars, REFERENCES, theme)).series[0].markLine;
    expect(markLine.data).toEqual([
      { xAxis: 1, name: "1 wk" },
      { xAxis: 2, name: "2 wk" },
    ]);
    expect(markLine.lineStyle.type).toBe("dashed");
  });

  // Regression from the velocity chart: lineStyle.opacity on a markLine fades
  // the label with the line, which is what made "avg 890.3" unreadable.
  it("sets no opacity, which would fade the threshold labels", () => {
    const markLine = asAny(capacityBarsOption(bars, REFERENCES, theme)).series[0].markLine;
    expect(markLine.lineStyle.opacity).toBeUndefined();
  });

  // A markLine defaults to drawing above the series, so a vertical threshold
  // crossing a bar's caption struck the text through.
  it("draws behind the bars and their captions", () => {
    const markLine = asAny(capacityBarsOption(bars, REFERENCES, theme)).series[0].markLine;
    expect(markLine.z).toBeLessThan(2);
  });

  it("puts the threshold chips at the top, clear of the axis tick labels", () => {
    const option = asAny(capacityBarsOption(bars, REFERENCES, theme));
    expect(option.series[0].markLine.label.position).toBe("start");
    // …and reserves the strip they sit in, or they are clipped away.
    expect(option.grid.top).toBeGreaterThanOrEqual(20);
  });

  // The axis is derived from the highest threshold, so a threshold can never
  // fall off the right edge — it stretches the axis instead of being clipped.
  it("stretches the axis to contain a threshold rather than clipping it", () => {
    const option = asAny(
      capacityBarsOption([{ ...bars[3]! }], [{ weeks: 6, label: "6 wk" }], theme),
    );
    expect(option.series[0].markLine.data).toEqual([{ xAxis: 6, name: "6 wk" }]);
    expect(option.xAxis.max).toBeGreaterThanOrEqual(6);
  });

  it("draws no threshold lines when none are given", () => {
    const option = asAny(capacityBarsOption(bars, [], theme));
    expect(option.series[0].markLine.data).toEqual([]);
    expect(option.xAxis.max).toBeGreaterThan(0);
  });
});

describe("capacityBarsOption — tidy axis ticks", () => {
  it("rounds the axis up to a half week instead of 1.15x the busiest person", () => {
    // 3.4 * 1.15 = 3.91, which ECharts renders as a "3.91 wk" tick.
    const option = asAny(capacityBarsOption(bars, REFERENCES, theme));
    expect(option.xAxis.max).toBe(4);
  });

  it("still leaves headroom above the busiest bar", () => {
    const option = asAny(capacityBarsOption(bars, REFERENCES, theme));
    expect(option.xAxis.max).toBeGreaterThan(3.4);
  });

  it("keeps captions readable where a threshold crosses them", () => {
    const label = asAny(capacityBarsOption(bars, REFERENCES, theme)).series[0].label;
    expect(label.backgroundColor).toBe(theme.surface);
  });
});

describe("capacityBarsOption — the bars", () => {
  it("colours each bar from its status tone", () => {
    const data = asAny(capacityBarsOption(bars, REFERENCES, theme)).series[0].data;
    expect(data[0].itemStyle.color).toBe(toneColor(theme, "danger"));
    expect(data[3].itemStyle.color).toBe(toneColor(theme, "neutral"));
  });

  it("states the emphasis fill so a bar cannot blank out on hover", () => {
    const data = asAny(capacityBarsOption(bars, REFERENCES, theme)).series[0].data;
    for (const d of data) {
      expect(d.emphasis.itemStyle.color).toBe(d.itemStyle.color);
    }
  });

  // A zero-length bar draws nothing; without the outside caption the row would
  // look like missing data rather than "this person has nothing queued".
  it("captions a zero-work person outside the bar", () => {
    const option = asAny(capacityBarsOption(bars, REFERENCES, theme));
    expect(option.series[0].data[3].value).toBe(0);
    expect(option.series[0].label.position).toBe("right");
    expect(option.series[0].label.formatter({ dataIndex: 3 })).toBe("no open work");
  });

  it("captions every other row too, without needing a tooltip", () => {
    const format = asAny(capacityBarsOption(bars, REFERENCES, theme)).series[0].label.formatter;
    expect(format({ dataIndex: 0 })).toBe("136h · 21 issues");
  });

  it("survives an empty team without throwing", () => {
    const option = asAny(capacityBarsOption([], REFERENCES, theme));
    expect(option.series[0].data).toEqual([]);
    expect(option.xAxis.max).toBeGreaterThanOrEqual(2);
  });

  it("uses no hard-coded hex", () => {
    expect(JSON.stringify(capacityBarsOption(bars, REFERENCES, theme))).not.toMatch(
      /#[0-9a-f]{3,8}\b/i,
    );
  });
});

describe("capacityBarsHeight", () => {
  it("grows with the number of people", () => {
    expect(capacityBarsHeight(12)).toBeGreaterThan(capacityBarsHeight(4));
  });

  it("keeps a floor so a one-person team is not a sliver", () => {
    expect(capacityBarsHeight(1)).toBeGreaterThanOrEqual(120);
    expect(capacityBarsHeight(0)).toBeGreaterThanOrEqual(120);
  });
});

describe("capacityBarsSummary", () => {
  it("reads out every person, their weeks and their caption", () => {
    const summary = capacityBarsSummary(bars);
    expect(summary).toContain("4 people");
    expect(summary).toContain("Daniel Ahmed 3.4 weeks, 136h · 21 issues");
    expect(summary).toContain("Lea Fischer 0 weeks, no open work");
  });

  it("handles one person without saying 'people'", () => {
    expect(capacityBarsSummary([bars[0]!])).toContain("1 person");
  });

  it("says so plainly when there is nobody", () => {
    expect(capacityBarsSummary([])).toBe("Nobody to show.");
  });
});
