import { describe, expect, it } from "vitest";
import {
  statusDonutOption,
  statusDonutSummary,
  type StatusSegment,
} from "./status-donut-option";
import { FALLBACK_CHART_THEME } from "../chart-theme";

const theme = FALLBACK_CHART_THEME;
const segments: StatusSegment[] = [
  { status: "TODO", label: "To Do", count: 30, tone: "neutral" },
  { status: "IN_PROGRESS", label: "In Progress", count: 10, tone: "accent" },
  { status: "IN_REVIEW", label: "In Review", count: 0, tone: "warning" },
  { status: "DONE", label: "Done", count: 60, tone: "success" },
];
const TOTAL = 100;

/* eslint-disable @typescript-eslint/no-explicit-any */
const asAny = (v: unknown) => v as any;

describe("statusDonutOption", () => {
  it("draws one slice per non-empty status, in workflow order", () => {
    const option = asAny(statusDonutOption(segments, TOTAL, theme));
    expect(option.series[0].data.map((d: any) => d.name)).toEqual([
      "To Do",
      "In Progress",
      "Done",
    ]);
  });

  it("drops zero-count statuses from the ring but keeps them in the legend", () => {
    const option = asAny(statusDonutOption(segments, TOTAL, theme));
    expect(option.series[0].data.map((d: any) => d.name)).not.toContain("In Review");
    expect(option.legend.data).toContain("In Review");
  });

  it("puts the total in the centre", () => {
    const option = asAny(statusDonutOption(segments, TOTAL, theme));
    expect(option.title.text).toBe("100");
  });

  it("is a donut, not a pie — the hole carries the total", () => {
    const option = asAny(statusDonutOption(segments, TOTAL, theme));
    expect(option.series[0].radius[0]).not.toBe(0);
  });

  it("shows count AND percentage in the legend, not only on hover (rule 3)", () => {
    const option = asAny(statusDonutOption(segments, TOTAL, theme));
    const label = option.legend.formatter("Done");
    expect(label).toContain("60");
    expect(label).toContain("60%");
  });

  it("maps each status to its semantic tone colour", () => {
    const option = asAny(statusDonutOption(segments, TOTAL, theme));
    const done = option.series[0].data.find((d: any) => d.name === "Done");
    const inProgress = option.series[0].data.find((d: any) => d.name === "In Progress");
    expect(done.itemStyle.color).toBe(theme.success);
    expect(inProgress.itemStyle.color).toBe(theme.accent);
  });

  it("uses no hard-coded hex colour", () => {
    const json = JSON.stringify(statusDonutOption(segments, TOTAL, theme));
    expect(json).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("does not divide by zero when the project has no issues", () => {
    const empty = segments.map((s) => ({ ...s, count: 0 }));
    const option = asAny(statusDonutOption(empty, 0, theme));
    expect(option.series[0].data).toEqual([]);
    expect(option.legend.formatter("Done")).toContain("0%");
  });
});

describe("statusDonutSummary", () => {
  it("states every status with its count and share", () => {
    const summary = statusDonutSummary(segments, TOTAL);
    expect(summary).toContain("100 issues by status");
    expect(summary).toContain("Done 60 (60%)");
    expect(summary).toContain("In Review 0 (0%)");
  });
});
