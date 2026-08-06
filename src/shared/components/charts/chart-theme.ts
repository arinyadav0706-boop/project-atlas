// Bridges our CSS custom properties into ECharts (ADR-0036 rule 4).
//
// ECharts draws to a canvas, so it cannot see Tailwind classes — every colour
// has to be resolved to a concrete value at runtime. Reading the tokens off the
// document (rather than hard-coding hex) is what keeps a theme swap, dark mode
// and a white-label deployment working.

export interface ChartTheme {
  foreground: string;
  muted: string;
  border: string;
  surface: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  /** Categorical series order, used when a chart does not name its tones. */
  palette: string[];
}

// Tokens are stored as bare HSL triples ("217 91% 55%") so Tailwind can apply
// opacity; ECharts needs a complete colour function.
function readToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const raw = styles.getPropertyValue(name).trim();
  if (!raw) return fallback;
  // Already a complete colour (hex or function) — pass through untouched.
  if (raw.startsWith("#") || raw.includes("(")) return raw;
  return `hsl(${raw})`;
}

// Used during SSR and before the document is available. Mirrors the light
// theme in globals.css; the real values replace these on mount.
export const FALLBACK_CHART_THEME: ChartTheme = {
  foreground: "hsl(240 4% 12%)",
  muted: "hsl(240 4% 46%)",
  border: "hsl(240 6% 90%)",
  surface: "hsl(240 20% 99%)",
  accent: "hsl(217 91% 55%)",
  success: "hsl(142 71% 40%)",
  warning: "hsl(38 92% 46%)",
  danger: "hsl(0 72% 51%)",
  palette: ["hsl(217 91% 55%)", "hsl(142 71% 40%)", "hsl(38 92% 46%)", "hsl(0 72% 51%)"],
};

export function resolveChartTheme(element?: HTMLElement): ChartTheme {
  if (typeof window === "undefined") return FALLBACK_CHART_THEME;
  const styles = window.getComputedStyle(element ?? document.documentElement);
  const accent = readToken(styles, "--accent", FALLBACK_CHART_THEME.accent);
  const success = readToken(styles, "--success", FALLBACK_CHART_THEME.success);
  const warning = readToken(styles, "--warning", FALLBACK_CHART_THEME.warning);
  const danger = readToken(styles, "--destructive", FALLBACK_CHART_THEME.danger);
  const muted = readToken(styles, "--muted-foreground", FALLBACK_CHART_THEME.muted);
  return {
    foreground: readToken(styles, "--foreground", FALLBACK_CHART_THEME.foreground),
    muted,
    border: readToken(styles, "--border", FALLBACK_CHART_THEME.border),
    surface: readToken(styles, "--surface", FALLBACK_CHART_THEME.surface),
    accent,
    success,
    warning,
    danger,
    palette: [accent, success, warning, danger, muted],
  };
}

// Semantic tones (docs/05_UI/03_Data_Visualisation.md §6) resolved against the
// live theme. One meaning per colour, product-wide.
export type ChartTone = "accent" | "success" | "warning" | "danger" | "neutral";

export function toneColor(theme: ChartTheme, tone: ChartTone): string {
  switch (tone) {
    case "success":
      return theme.success;
    case "warning":
      return theme.warning;
    case "danger":
      return theme.danger;
    case "neutral":
      return theme.muted;
    case "accent":
    default:
      return theme.accent;
  }
}
