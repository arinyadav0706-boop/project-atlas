import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animate";

// Color tokens mirror docs/05_UI/02_Screens_and_Information_Architecture.md §5.
// Light theme is the default/primary look (docs/05_UI/01_UI_Design_Principles.md §2) —
// dark mode is intentionally not wired up yet (secondary priority).
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        surface: "hsl(var(--surface))",
        canvas: "hsl(var(--canvas))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        // Status tones shared with the charts (03_Data_Visualisation.md §6), so
        // a status is the same colour in a legend and in a status dot. No
        // `-foreground` pair until something actually sets text on the fill.
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
        // Surface radius. Cards read softer than controls on purpose — the
        // container should feel like paper, the control like a button.
        "2xl": "1.25rem",
      },
      // Elevation, as three named steps rather than ad-hoc shadow utilities.
      //
      // Deliberately very low alpha: at this radius a heavy shadow reads as a
      // 2010 drop-shadow, and the mockups get their depth from a hairline
      // border plus a barely-there lift. Two stacked shadows give the contact
      // shadow and the ambient one, which is what makes it look lit rather
      // than outlined.
      boxShadow: {
        card: "0 1px 2px hsl(240 6% 10% / 0.04), 0 1px 3px hsl(240 6% 10% / 0.03)",
        "card-hover": "0 2px 4px hsl(240 6% 10% / 0.05), 0 4px 12px hsl(240 6% 10% / 0.06)",
        pop: "0 4px 8px hsl(240 6% 10% / 0.06), 0 12px 28px hsl(240 6% 10% / 0.10)",
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "-apple-system",
          "BlinkMacSystemFont",
          "\"SF Pro Text\"",
          "Inter",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [animatePlugin],
};

export default config;
