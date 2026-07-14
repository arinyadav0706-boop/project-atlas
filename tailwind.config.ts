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
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
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
