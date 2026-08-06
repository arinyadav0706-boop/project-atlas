// Pure data-prep helpers shared by the ECharts option builders (ADR-0036).
//
// Layout maths (axis scaling, bar rectangles, donut arcs) used to live here for
// the in-house SVG kit; ECharts owns all of that now, so it was deleted rather
// than left as dead code (CLAUDE.md rule 10). What remains is the arithmetic
// ECharts does NOT do for us and that our metric rules depend on.

/** Mean of a series, or null for an empty one — never 0 (metric rule 4). */
export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  const total = values.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  return total / values.length;
}

/**
 * Compact axis label. "VWP Sprint 12" → "S12" so eight labels stay legible.
 * Only abbreviates something that actually says "sprint" — a bare trailing
 * digit is not a sprint number ("Q1" must not become "S1").
 */
export function shortSeriesLabel(label: string, maxChars = 6): string {
  const trimmed = label.trim();
  const sprint = trimmed.match(/sprint\s*#?\s*(\d+)/i);
  if (sprint) return `S${sprint[1]}`;
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars - 1)}…`;
}

/** Whole-percentage share for a legend, 0 when the total is 0. */
export function percentOf(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}
