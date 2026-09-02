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
        // ── Modernization tokens (04_Modernization_Audit.md §E) ────────────
        // Additive: no existing key is changed, so no existing screen moves.
        //
        // `primary` is an alias of accent. It exists because four components
        // shipped `bg-primary`/`text-primary` against nothing, Tailwind
        // dropped the utilities in silence, and their selected states rendered
        // identically to unselected (UI-3). Now the class resolves.
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        "surface-sunken": "hsl(var(--surface-sunken))",
        "surface-raised": "hsl(var(--surface-raised))",
        "border-subtle": "hsl(var(--border-subtle))",
        "border-strong": "hsl(var(--border-strong))",
        info: "hsl(var(--info))",
        // Already referenced by epic-select and comment-composer against
        // nothing; see globals.css.
        input: "hsl(var(--input))",
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
        // Surface radius. Cards read softer than controls on purpose — the
        // container should feel like paper, the control like a button.
        "2xl": "1.25rem",
        // ── Modernization radii (04_Modernization_Audit.md §E4) ───────────
        //
        // NEW NAMES rather than new values for lg/xl/2xl, deliberately.
        // Re-valuing `rounded-2xl` from 20px to 8px would restyle every panel
        // in the app in one commit — the big-bang the brief forbids, and the
        // opposite of gating on /issues. These three are used only by the new
        // primitives; the old names are migrated page by page after the gate.
        chip: "4px",
        control: "6px",
        panel: "8px",
      },
      // Semantic type scale (§E3). Six roles, replacing the nine ad-hoc sizes
      // measured on a single page.
      //
      // REVISED at the /issues gate. The first scale bought density by
      // shrinking text — 13px body, 11px metadata — and the result read as
      // small rather than dense. Density is now bought back with spacing and
      // layout instead: 14px body, 12px metadata, and a 36px row. `micro` is
      // the 11px floor and is for genuinely secondary metadata only (a relative
      // timestamp, a count), never for anything a person has to read to do
      // their job.
      fontSize: {
        "page-title": ["21px", { lineHeight: "28px", fontWeight: "600", letterSpacing: "-0.014em" }],
        section: ["16px", { lineHeight: "22px", fontWeight: "600", letterSpacing: "-0.006em" }],
        body: ["14px", { lineHeight: "20px" }],
        label: ["12px", { lineHeight: "16px", fontWeight: "500" }],
        meta: ["12px", { lineHeight: "16px" }],
        micro: ["11px", { lineHeight: "15px" }],
      },
      // Component sizing (§E5), so a row height is a token and not a guess
      // re-made in six table implementations.
      height: {
        topbar: "48px",
        // 44, not 40: the existing Input is 40px tall, and a 40px bar left it
        // flush against both edges. Four pixels is the difference between a
        // toolbar and a seam.
        toolbar: "44px",
        // 36, not 32: at 14px body text a 32px row leaves 6px of breathing
        // room above and below, which reads as cramped rather than dense. 36
        // is Linear's row height and one notch under Jira's ~40.
        "row-compact": "36px",
        "row-comfy": "44px",
        "col-head": "36px",
        "ctl-sm": "24px",
        "ctl-md": "28px",
        "ctl-lg": "32px",
      },
      ringColor: {
        focus: "hsl(var(--focus-ring))",
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
