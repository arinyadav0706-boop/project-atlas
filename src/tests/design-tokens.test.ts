import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import resolveConfig from "tailwindcss/resolveConfig";
import tailwindConfig from "../../tailwind.config";

// Backlog UX-2 — nothing fails when a component names a colour that does not
// exist.
//
// This test exists because of a real, shipped bug. There was no `--primary`
// token, and four components wrote their selected state as `border-primary` /
// `bg-primary` / `text-primary`. Tailwind silently drops an unknown utility,
// so those selected states rendered IDENTICALLY to unselected — including the
// API-token scope checkboxes, where a ticked box showed empty. It typechecked,
// it linted, it built, and it was wrong for months (UX-1).
//
// A colour utility that resolves to nothing is invisible in every automated
// check we had. So the check is here: every colour-like utility in the source
// must name a colour the Tailwind theme actually defines.
//
// Deliberately NOT an ESLint plugin: a plugin is more machinery for the same
// assertion, and this runs in the existing unit suite.

const theme = resolveConfig(tailwindConfig).theme;

/** Every colour name Tailwind will resolve, including nested keys like `accent-foreground`. */
function knownColours(): Set<string> {
  const names = new Set<string>();
  const walk = (value: unknown, prefix: string) => {
    if (typeof value === "string" || typeof value === "function") {
      names.add(prefix);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === "DEFAULT") names.add(prefix);
        else walk(child, prefix ? `${prefix}-${key}` : key);
      }
    }
  };
  walk(theme?.colors ?? {}, "");
  return names;
}

/**
 * The OTHER theme scales a prefix can legally name.
 *
 * Without this the guard flags `text-body` (a font size) and `ring-focus` (a
 * ring colour) — both of which resolve perfectly well. Read from the resolved
 * theme rather than listed by hand, so adding a scale key never means editing
 * this test.
 */
const SIBLING_SCALES: Record<string, string[]> = {
  bg: ["backgroundImage", "backgroundSize", "backgroundPosition", "backgroundColor"],
  text: ["fontSize", "textColor"],
  border: ["borderWidth", "borderColor", "borderRadius"],
  ring: ["ringWidth", "ringColor", "ringOffsetWidth"],
  divide: ["divideWidth", "divideColor"],
  fill: ["fill"],
  stroke: ["strokeWidth", "stroke"],
  outline: ["outlineWidth", "outlineColor", "outlineOffset"],
  placeholder: ["placeholderColor"],
  caret: ["caretColor"],
  accent: ["accentColor"],
  decoration: ["textDecorationThickness", "textDecorationColor"],
  shadow: ["boxShadow"],
};

function scaleKeys(prefix: string): Set<string> {
  const keys = new Set<string>();
  for (const scale of SIBLING_SCALES[prefix] ?? []) {
    const values = (theme as unknown as Record<string, unknown>)[scale];
    if (values && typeof values === "object") {
      for (const key of Object.keys(values)) keys.add(key);
    }
  }
  return keys;
}

/**
 * Utility prefixes that take a colour, paired with the non-colour KEYWORDS that
 * are also legal for them.
 *
 * Without the second half this flags `text-left` and `border-dashed`, which are
 * fine. Keywords only — theme-driven values are covered by `scaleKeys` above,
 * so this list does not need updating when a token is added.
 */
const COLOUR_PREFIXES: Record<string, RegExp> = {
  bg: /^(none|inherit|current|transparent|clip|origin|repeat|no|auto|cover|contain|center|top|bottom|left|right|fixed|local|scroll|gradient|opacity|blend)/,
  text: /^(xs|sm|base|lg|xl|[0-9]xl|left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|opacity|inherit|current|transparent|\[)/,
  border: /^(0|2|4|8|x|y|t|r|b|l|s|e|solid|dashed|dotted|double|hidden|none|collapse|separate|spacing|inherit|current|transparent|\[)/,
  ring: /^(0|1|2|4|8|inset|offset|opacity|inherit|current|transparent|\[)/,
  divide: /^(x|y|solid|dashed|dotted|double|none|reverse|opacity|inherit|current|transparent|\[)/,
  fill: /^(none|inherit|current|transparent|\[)/,
  stroke: /^(0|1|2|none|inherit|current|transparent|\[)/,
  outline: /^(0|1|2|4|8|none|dashed|dotted|double|hidden|offset|inherit|current|transparent|\[)/,
  placeholder: /^(opacity|inherit|current|transparent|\[)/,
  caret: /^(inherit|current|transparent|\[)/,
  accent: /^(auto|inherit|current|transparent|\[)/,
  decoration: /^(0|1|2|4|8|solid|double|dotted|dashed|wavy|auto|from-font|none|inherit|current|transparent|slice|clone|\[)/,
  shadow: /^(sm|md|lg|xl|2xl|inner|none|card|card-hover|pop|\[)/,
};

/** `hover:`, `dark:`, `lg:`, `group-hover:`, `data-[state=open]:` … */
const VARIANT = /^(?:[a-z0-9-]+:|\[[^\]]+\]:|(?:group|peer)(?:-[a-z-]+)?(?:\/[a-z0-9-]+)?:)+/;

interface Offence {
  file: string;
  utility: string;
  colour: string;
}

/** `node:fs`'s `globSync` is not in this @types/node, so: a nine-line walker. */
function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

function scan(): Offence[] {
  const root = process.cwd();
  const files = sourceFiles(join(root, "src"));
  const colours = knownColours();
  const offences: Offence[] = [];

  for (const absolute of files) {
    const file = relative(root, absolute);
    const source = readFileSync(absolute, "utf8");
    // Class names only ever live in string literals in this codebase.
    for (const match of source.matchAll(/["'`]([^"'`\n]{2,400})["'`]/g)) {
      for (const raw of (match[1] ?? "").split(/\s+/)) {
        const token = raw.replace(VARIANT, "").replace(/^!/, "");
        const slash = token.indexOf("/"); // opacity modifier: bg-accent/10
        const bare = slash === -1 ? token : token.slice(0, slash);
        const dash = bare.indexOf("-");
        if (dash <= 0) continue;
        const prefix = bare.slice(0, dash);
        const suffix = bare.slice(dash + 1);
        const nonColour = COLOUR_PREFIXES[prefix];
        if (!nonColour) continue;
        if (nonColour.test(suffix)) continue;
        // Numeric scales (`text-2`, `border-4`) are never colours.
        if (/^\d/.test(suffix)) continue;
        // Arbitrary values — `bg-[#F8FAFC]` — always resolve, so they are not
        // the invisible failure this test hunts. They ARE a token-discipline
        // problem, but a different one: flagging them here would bury the
        // silent-failure signal under style opinions.
        if (suffix.startsWith("[")) continue;
        if (colours.has(suffix)) continue;
        // `text-body` is a font size, `ring-focus` a ring colour — both real.
        if (scaleKeys(prefix).has(suffix)) continue;
        offences.push({ file, utility: bare, colour: suffix });
      }
    }
  }
  return offences;
}

describe("colour utilities name colours that exist", () => {
  it("finds no utility referring to an undefined colour token", () => {
    const offences = scan();
    const message = offences
      .map((o) => `  ${o.file}: "${o.utility}" — no colour named "${o.colour}"`)
      .join("\n");

    expect(
      offences,
      offences.length === 0
        ? ""
        : `Tailwind silently drops these, so they render as NOTHING:\n${message}\n\n` +
          `Either add the token to tailwind.config.ts + globals.css (both themes), ` +
          `or use an existing one. This is exactly how UX-1 shipped four invisible ` +
          `selected states.`,
    ).toEqual([]);
  });

  it("knows the tokens the modernization added, in both themes", () => {
    // Guards the other direction: a token declared in the config but missing
    // from globals.css resolves to `hsl()` of nothing, which is equally
    // invisible and equally silent.
    const colours = knownColours();
    for (const name of [
      "primary",
      "primary-foreground",
      "surface-sunken",
      "surface-raised",
      "border-subtle",
      "border-strong",
      "info",
    ]) {
      expect(colours.has(name), `tailwind.config.ts is missing "${name}"`).toBe(true);
    }

    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const light = css.slice(css.indexOf(":root"), css.indexOf(".dark"));
    const dark = css.slice(css.indexOf(".dark"));
    for (const variable of [
      "--primary",
      "--surface-sunken",
      "--surface-raised",
      "--border-subtle",
      "--border-strong",
      "--info",
      "--focus-ring",
    ]) {
      expect(light.includes(variable), `${variable} missing from the light theme`).toBe(true);
      expect(dark.includes(variable), `${variable} missing from the dark theme`).toBe(true);
    }
  });
});
