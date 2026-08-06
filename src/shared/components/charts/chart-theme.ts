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

/**
 * Normalise a CSS colour into a form ECharts can *parse*, not merely paint.
 *
 * This distinction is the whole point of this function, and getting it wrong
 * produced a real bug: canvas `fillStyle` is parsed by the browser, which
 * accepts modern space-separated `hsl(217 91% 55%)` — so base fills rendered
 * perfectly. But ECharts derives hover/emphasis colours in JavaScript via
 * zrender's own parser, which only understands the legacy comma syntax. It
 * returned undefined, and `lift()` has no else-branch, so the emphasis fill
 * became undefined and **the hovered bar vanished**. Correct at rest, invisible
 * on interaction, with no error anywhere.
 *
 * So: always emit comma-separated. `chart-theme.test.ts` asserts every token
 * survives ECharts' real parser.
 */
export function normalizeColor(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.startsWith("#")) return value;

  const fn = value.match(/^(hsla?|rgba?)\(([^)]*)\)$/i);
  if (fn) {
    const name = fn[1]!.toLowerCase();
    const inner = fn[2]!.trim();
    if (inner.includes(",")) return value; // already legacy syntax
    return `${withAlphaName(name, splitModern(inner))}(${splitModern(inner).join(", ")})`;
  }

  // A bare Tailwind token triple: "217 91% 55%" (optionally "… / 50%").
  const parts = splitModern(value);
  if (parts.length < 3) return null;
  return `${withAlphaName("hsl", parts)}(${parts.join(", ")})`;
}

// Modern CSS separates channels with spaces and alpha with a slash.
function splitModern(inner: string): string[] {
  return inner.split(/\s*\/\s*|\s+/).filter(Boolean);
}

function withAlphaName(name: string, parts: string[]): string {
  const base = name.replace(/a$/, "");
  return parts.length >= 4 ? `${base}a` : base;
}

// Tokens are stored as bare HSL triples ("217 91% 55%") so Tailwind can apply
// opacity; ECharts needs a complete colour function.
function readToken(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  return normalizeColor(styles.getPropertyValue(name)) ?? fallback;
}

// Used during SSR and before the document is available. Mirrors the light
// theme in globals.css; the real values replace these on mount. Comma syntax
// here too — see `normalizeColor`.
export const FALLBACK_CHART_THEME: ChartTheme = {
  foreground: "hsl(240, 4%, 12%)",
  muted: "hsl(240, 4%, 46%)",
  border: "hsl(240, 6%, 90%)",
  surface: "hsl(240, 20%, 99%)",
  accent: "hsl(217, 91%, 55%)",
  success: "hsl(142, 71%, 40%)",
  warning: "hsl(38, 92%, 46%)",
  danger: "hsl(0, 72%, 51%)",
  palette: [
    "hsl(217, 91%, 55%)",
    "hsl(142, 71%, 40%)",
    "hsl(38, 92%, 46%)",
    "hsl(0, 72%, 51%)",
  ],
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
