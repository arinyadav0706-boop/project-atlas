import { CODE_PROVIDERS, type CodeProviderId } from "@/features/code-integration/lib/provider";

// What a human needs to know to wire a provider up (34_code_integration.md §6).
//
// Separate from the adapters for one hard reason and one soft one. Hard: the
// adapters import `node:crypto`, so a client component cannot import them, and
// this file has to be readable by the admin screen. Soft: an adapter is about
// payloads, and where a secret goes in somebody else's form is not a payload.
//
// The property that matters is that **the admin screen names no provider**. Add
// Bitbucket and the picker, the host placeholder and the setup instructions all
// appear without touching a component.

export interface ProviderSetup {
  id: CodeProviderId;
  /** How the product spells its own name. */
  label: string;
  /** Pre-filled host for the hosted service; a self-hosted install differs. */
  defaultBaseUrl: string;
  baseUrlHint: string;
  /** Where the hook is created, so somebody knows what to open. */
  where: string;
  /** What to tick, in that provider's own words. */
  eventsToEnable: string[];
  /** What the secret field is called on the other side. */
  secretFieldLabel: string;
  /**
   * Settings that are not optional, phrased as instructions.
   *
   * Only things whose absence breaks the integration silently go here — an
   * error somebody can see does not need a warning in advance.
   */
  mustDo: string[];
}

export const PROVIDER_CATALOG: Record<CodeProviderId, ProviderSetup> = {
  GITLAB: {
    id: "GITLAB",
    label: "GitLab",
    defaultBaseUrl: "https://gitlab.com",
    baseUrlHint: "gitlab.com, or your self-managed instance.",
    where: "Project or group → Settings → Webhooks",
    eventsToEnable: ["Push events", "Merge request events", "Pipeline events"],
    secretFieldLabel: "Secret token",
    mustDo: [],
  },
  GITHUB: {
    id: "GITHUB",
    label: "GitHub",
    defaultBaseUrl: "https://github.com",
    baseUrlHint: "github.com, or your GitHub Enterprise Server.",
    where: "Repository or organisation → Settings → Webhooks → Add webhook",
    eventsToEnable: ["Pushes", "Pull requests", "Check suites"],
    secretFieldLabel: "Secret",
    mustDo: [
      // GitHub's form defaults to form-urlencoded. The adapter now decodes that
      // too, but the setting is still worth stating: it is one dropdown, and
      // depending on a fallback for the common path is how fallbacks rot.
      "Set Content type to application/json — the default sends the payload form-encoded.",
      // Otherwise GitHub sends `push` and nothing else, and pull requests never
      // appear, with no error anywhere to explain it.
      "Choose “Let me select individual events” — the default is pushes only.",
    ],
  },
};

export function providerSetup(id: CodeProviderId): ProviderSetup {
  return PROVIDER_CATALOG[id];
}

/** Every provider, in the order the picker should offer them. */
export const PROVIDER_LIST: ProviderSetup[] = CODE_PROVIDERS.map((id) => PROVIDER_CATALOG[id]);
