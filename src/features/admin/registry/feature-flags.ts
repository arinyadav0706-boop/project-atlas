// The feature-flag CATALOG lives in code (ADR-0023 §1). The DB stores only
// per-org overrides; a flag absent from the DB takes its `defaultEnabled` here.
// Adding a flag = one entry below (works immediately, zero DB rows). Removing a
// flag = delete the entry (any stale override row becomes inert).

export interface FeatureFlagDefinition {
  description: string;
  defaultEnabled: boolean;
  // The owning module/feature — so the admin UI shows who to ask about a flag,
  // and so a module's flags are greppable.
  owner: string;
}

export const FEATURE_FLAGS = {
  // A kill-switch for a shipped feature (ADR-0023 §1): default ON, an ADMIN can
  // turn the global ⌘K palette off for their org without a deploy. Proves the
  // seam end to end — the app shell gates the palette on this.
  "platform.commandPalette": {
    description: "Global ⌘K search palette in the top bar.",
    defaultEnabled: true,
    owner: "search",
  },
  // Dark-launched: fuzzy/typo search matching (FUT-18) lands behind this flag,
  // off until the pg_trgm work ships.
  "search.fuzzyMatching": {
    description: "Trigram fuzzy / typo-tolerant search matching (not yet built).",
    defaultEnabled: false,
    owner: "search",
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlagKey = keyof typeof FEATURE_FLAGS;

export const FEATURE_FLAG_KEYS = Object.keys(FEATURE_FLAGS) as FeatureFlagKey[];

export function isFeatureFlagKey(key: string): key is FeatureFlagKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, key);
}
