import type { CodeProviderAdapter, CodeProviderId } from "@/features/code-integration/lib/provider";
import { GitLabAdapter } from "@/features/code-integration/lib/gitlab";

// The one place that maps a stored provider id to its adapter (ADR-0053 §4).
//
// Adding GitHub is: write the adapter, add the enum value, add a line here.
// Nothing else in the module — not the endpoint, not the linking service, not
// the panel — mentions a provider by name, which is the property that makes
// that claim true rather than aspirational.

const ADAPTERS: Record<CodeProviderId, CodeProviderAdapter> = {
  GITLAB: GitLabAdapter,
};

export function adapterFor(provider: CodeProviderId): CodeProviderAdapter {
  return ADAPTERS[provider];
}
