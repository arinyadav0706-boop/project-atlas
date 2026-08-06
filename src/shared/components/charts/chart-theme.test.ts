import { describe, expect, it } from "vitest";
import { echartsColor } from "./echarts-core";
import {
  FALLBACK_CHART_THEME,
  normalizeColor,
  toneColor,
  type ChartTheme,
  type ChartTone,
} from "./chart-theme";

// The bug this file exists to prevent
// ------------------------------------
// Tokens were emitted as modern space-separated `hsl(217 91% 55%)`. Canvas
// painted them fine, because the *browser* parses fillStyle. But ECharts
// computes hover colours in JS with zrender's parser, which only understands
// the legacy comma form. It returned undefined; `lift()` has no else-branch, so
// the emphasis fill became undefined and the hovered bar disappeared.
//
// Nothing threw. Types were satisfied. Tests were green. The only way to catch
// it is to run the colours through the parser ECharts actually uses, so that is
// what these tests do.

const ALL_TONES: ChartTone[] = ["accent", "success", "warning", "danger", "neutral"];

function expectParseable(color: string, label: string) {
  const parsed = echartsColor.parse(color);
  expect(parsed, `${label}: ECharts cannot parse ${color}`).toBeDefined();
  expect(echartsColor.lift(color, -0.1), `${label}: lift() of ${color} is undefined`).toBeTypeOf(
    "string",
  );
}

describe("normalizeColor", () => {
  it("wraps a bare Tailwind HSL triple in comma syntax", () => {
    expect(normalizeColor("217 91% 55%")).toBe("hsl(217, 91%, 55%)");
  });

  it("converts a modern space-separated hsl() to the legacy form", () => {
    expect(normalizeColor("hsl(217 91% 55%)")).toBe("hsl(217, 91%, 55%)");
  });

  it("promotes to hsla when a slash alpha is present", () => {
    expect(normalizeColor("217 91% 55% / 50%")).toBe("hsla(217, 91%, 55%, 50%)");
    expect(normalizeColor("hsl(217 91% 55% / 0.5)")).toBe("hsla(217, 91%, 55%, 0.5)");
  });

  it("leaves an already-legacy colour untouched", () => {
    expect(normalizeColor("hsl(217, 91%, 55%)")).toBe("hsl(217, 91%, 55%)");
    expect(normalizeColor("rgba(1, 2, 3, 0.4)")).toBe("rgba(1, 2, 3, 0.4)");
  });

  it("passes hex through", () => {
    expect(normalizeColor("#3b82f6")).toBe("#3b82f6");
  });

  it("handles surrounding whitespace from getPropertyValue", () => {
    expect(normalizeColor("  217 91% 55%  ")).toBe("hsl(217, 91%, 55%)");
  });

  it("returns null for an absent or unusable token so the caller can fall back", () => {
    expect(normalizeColor("")).toBeNull();
    expect(normalizeColor("   ")).toBeNull();
    expect(normalizeColor("217 91%")).toBeNull();
  });

  // The actual regression: every form we emit must survive ECharts' parser.
  it("produces colours ECharts can parse AND lift", () => {
    for (const input of ["217 91% 55%", "hsl(217 91% 55%)", "142 71% 40%", "0 72% 51%"]) {
      expectParseable(normalizeColor(input)!, input);
    }
  });

  it("the pre-fix format is genuinely broken — proving this test has teeth", () => {
    expect(echartsColor.parse("hsl(217 91% 55%)")).toBeUndefined();
    expect(echartsColor.lift("hsl(217 91% 55%)", -0.1)).toBeUndefined();
  });
});

describe("FALLBACK_CHART_THEME", () => {
  const entries = Object.entries(FALLBACK_CHART_THEME) as [keyof ChartTheme, string | string[]][];

  it.each(entries)("%s is parseable by ECharts", (name, value) => {
    for (const color of Array.isArray(value) ? value : [value]) {
      expectParseable(color, String(name));
    }
  });
});

describe("toneColor", () => {
  it.each(ALL_TONES)("%s resolves to a parseable theme colour", (tone) => {
    expectParseable(toneColor(FALLBACK_CHART_THEME, tone), tone);
  });

  it("maps each tone to its own token", () => {
    expect(toneColor(FALLBACK_CHART_THEME, "success")).toBe(FALLBACK_CHART_THEME.success);
    expect(toneColor(FALLBACK_CHART_THEME, "warning")).toBe(FALLBACK_CHART_THEME.warning);
    expect(toneColor(FALLBACK_CHART_THEME, "danger")).toBe(FALLBACK_CHART_THEME.danger);
    expect(toneColor(FALLBACK_CHART_THEME, "neutral")).toBe(FALLBACK_CHART_THEME.muted);
    expect(toneColor(FALLBACK_CHART_THEME, "accent")).toBe(FALLBACK_CHART_THEME.accent);
  });
});
