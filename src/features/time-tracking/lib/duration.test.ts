import { describe, it, expect } from "vitest";
import { parseDuration, formatDuration, splitMinutes } from "@/features/time-tracking/lib/duration";

describe("splitMinutes", () => {
  it("splits total minutes into hours + minutes", () => {
    expect(splitMinutes(0)).toEqual({ hours: 0, minutes: 0 });
    expect(splitMinutes(9)).toEqual({ hours: 0, minutes: 9 });
    expect(splitMinutes(90)).toEqual({ hours: 1, minutes: 30 });
    expect(splitMinutes(125)).toEqual({ hours: 2, minutes: 5 });
  });
});

describe("parseDuration (37_timesheets BR-5, ADR-0059 Q10)", () => {
  it("reads a bare number as HOURS", () => {
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("8")).toBe(480);
    expect(parseDuration(" 2 ")).toBe(120);
    expect(parseDuration("0.25")).toBe(15);
  });
  it("parses clock form", () => {
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("0:45")).toBe(45);
    expect(parseDuration("10:05")).toBe(605);
  });
  it("parses h/m combinations", () => {
    expect(parseDuration("1h")).toBe(60);
    expect(parseDuration("1h30m")).toBe(90);
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("90m")).toBe(90);
    expect(parseDuration("2H15M")).toBe(135);
    expect(parseDuration("1.5h")).toBe(90);
  });
  it("treats zero as 'clear', not as an error", () => {
    expect(parseDuration("0")).toBe(0);
    expect(parseDuration("0h 0m")).toBe(0);
    expect(parseDuration("0:00")).toBe(0);
  });
  it("rejects junk, negatives and more than 24h", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("-1")).toBeNull();
    expect(parseDuration("1x")).toBeNull();
    expect(parseDuration("1:75")).toBeNull();
    expect(parseDuration("25")).toBeNull();
    expect(parseDuration("24:01")).toBeNull();
    expect(parseDuration("24")).toBe(1440);
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes, omitting zero parts", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(30)).toBe("30m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(90)).toBe("1h 30m");
    expect(formatDuration(125)).toBe("2h 5m");
  });
  it("handles negative (over) durations", () => {
    expect(formatDuration(-45)).toBe("-45m");
    expect(formatDuration(-90)).toBe("-1h 30m");
  });
  it("round-trips with parseDuration", () => {
    for (const m of [1, 30, 60, 90, 125, 480, 1440]) {
      expect(parseDuration(formatDuration(m))).toBe(m);
    }
  });
});
