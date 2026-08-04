import { describe, it, expect } from "vitest";
import { parseDuration, formatDuration } from "@/features/time-tracking/lib/duration";

describe("parseDuration", () => {
  it("parses bare minutes", () => {
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration(" 45 ")).toBe(45);
  });
  it("parses h/m combinations", () => {
    expect(parseDuration("1h")).toBe(60);
    expect(parseDuration("1h30m")).toBe(90);
    expect(parseDuration("1h 30m")).toBe(90);
    expect(parseDuration("30m")).toBe(30);
    expect(parseDuration("2H15M")).toBe(135);
  });
  it("parses fractional hours", () => {
    expect(parseDuration("1.5h")).toBe(90);
    expect(parseDuration("0.25h")).toBe(15);
  });
  it("rejects junk and non-positive", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("0")).toBeNull();
    expect(parseDuration("0h 0m")).toBeNull();
    expect(parseDuration("1x")).toBeNull();
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
