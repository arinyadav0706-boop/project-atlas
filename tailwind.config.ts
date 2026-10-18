import type { Config } from "tailwindcss";
import animatePlugin from "tailwindcss-animate";

// EAGLES — Next-Gen Spatial Design System (Apple × Google × Linear × Stripe)
const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        card: "hsl(var(--surface))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          raised: "hsl(var(--surface-raised))",
          sunken: "hsl(var(--surface-sunken))",
        },
        canvas: "hsl(var(--canvas))",
        foreground: "hsl(var(--foreground))",
        border: {
          DEFAULT: "hsl(var(--border))",
          subtle: "hsl(var(--border-subtle))",
          strong: "hsl(var(--border-strong))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
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
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground, 0 0% 100%))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground, 0 0% 100%))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground, 0 0% 100%))",
        },
        google: {
          blue: "hsl(var(--google-blue))",
          red: "hsl(var(--google-red))",
          yellow: "hsl(var(--google-yellow))",
          green: "hsl(var(--google-green))",
          purple: "hsl(var(--google-purple))",
          cyan: "hsl(var(--google-cyan))",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm, 0.5rem)",
        md: "var(--radius-md, 0.75rem)",
        lg: "var(--radius-lg, 1rem)",
        xl: "var(--radius-xl, 1.25rem)",
        "2xl": "var(--radius-2xl, 1.5rem)",
        "3xl": "var(--radius-3xl, 1.875rem)",
      },
      boxShadow: {
        "2xs": "0 1px 2px 0 rgb(15 23 42 / 0.03)",
        xs: "0 2px 6px -1px rgb(15 23 42 / 0.04), 0 1px 2px -1px rgb(15 23 42 / 0.02)",
        card: "0 4px 20px -2px rgb(15 23 42 / 0.05), 0 1px 3px 0 rgb(15 23 42 / 0.03)",
        "card-hover":
          "0 14px 32px -4px rgb(15 23 42 / 0.08), 0 4px 12px -2px rgb(15 23 42 / 0.04)",
        pop: "0 20px 40px -8px rgb(15 23 42 / 0.12), 0 8px 16px -4px rgb(15 23 42 / 0.06)",
        glow: "0 4px 20px -2px hsl(var(--primary) / 0.32)",
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "\"SF Pro Text\"",
          "\"SF Pro Display\"",
          "var(--font-inter)",
          "Inter",
          "system-ui",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [animatePlugin],
};

export default config;
