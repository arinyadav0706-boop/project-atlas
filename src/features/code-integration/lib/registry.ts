import type { CodeProviderAdapter, CodeProviderId } from "@/features/code-integration/lib/provider";
import { GitLabAdapter } from "@/features/code-integration/lib/gitlab";
import { GitHubAdapter } from "@/features/code-integration/lib/github";

// The one place that maps a stored provider id to its adapter (ADR-0053 §4).
//
// Adding a provider is: write the adapter, add the enum value, add a line here.
// GitHub cost exactly that and nothing else — not the endpoint, not the linking
// service, not the panel, none of which mentions a provider by name. ADR-0053
// §9 scores the claim in full.

const ADAPTERS: Record<CodeProviderId, CodeProviderAdapter> = {
  GITLAB: GitLabAdapter,
  GITHUB: GitHubAdapter,
};

export function adapterFor(provider: CodeProviderId): CodeProviderAdapter {
  return ADAPTERS[provider];
}
