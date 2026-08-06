import { describe, expect, it } from "vitest";
import { mean, percentOf, shortSeriesLabel } from "./geometry";

// Layout maths moved into ECharts (ADR-0036); these are the helpers our metric
// rules still depend on.

describe("mean (metric rule 4: empty ⇒ null, never 0)", () => {
  it("averages a series", () => {
    expect(mean([10, 20, 30])).toBe(20);
  });

  it("returns null — not 0 — for an empty series", () => {
    expect(mean([])).toBeNull();
  });

  it("distinguishes a real zero average from no data", () => {
    expect(mean([0, 0])).toBe(0);
  });

  it("ignores non-finite values rather than producing NaN", () => {
    expect(mean([10, Number.NaN, 20])).toBe(10);
  });
});

describe("shortSeriesLabel", () => {
  it("compresses a sprint name to its number", () => {
    expect(shortSeriesLabel("VWP Sprint 12")).toBe("S12");
    expect(shortSeriesLabel("Sprint 3")).toBe("S3");
  });

  it("truncates a label with no sprint number", () => {
    expect(shortSeriesLabel("Hardening")).toBe("Harde…");
  });

  it("leaves an already-short label alone", () => {
    expect(shortSeriesLabel("Q1")).toBe("Q1");
  });

  // Regression: the first implementation treated ANY trailing digit as a
  // sprint number, so "Q1" rendered as "S1" — a wrong label, silently.
  it("does not invent a sprint number from a trailing digit", () => {
    expect(shortSeriesLabel("Q1")).not.toBe("S1");
    expect(shortSeriesLabel("Release 2")).toBe("Relea…");
    expect(shortSeriesLabel("2026")).toBe("2026");
  });

  it("handles the sprint word in any casing or spacing", () => {
    expect(shortSeriesLabel("SPRINT9")).toBe("S9");
    expect(shortSeriesLabel("sprint #4")).toBe("S4");
  });
});

describe("percentOf", () => {
  it("rounds to a whole percent", () => {
    expect(percentOf(1, 3)).toBe(33);
  });

  it("is 0 rather than NaN when there is no total", () => {
    expect(percentOf(5, 0)).toBe(0);
  });
});
