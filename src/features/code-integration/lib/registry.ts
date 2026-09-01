import type { CodeProviderAdapter, CodeProviderId } from "@/features/code-integration/lib/provider";
import { GitLabAdapter } from "@/features/code-integration/lib/gitlab";
import { GitHubAdapter } from "@/features/code-integration/lib/github";
import type { CredentialProvider } from "@/features/code-integration/lib/credential";
import { GitLabCredentialProvider } from "@/features/code-integration/lib/gitlab-credential";
import { GitHubCredentialProvider } from "@/features/code-integration/lib/github-credential";
import type { CodeApiClient } from "@/features/code-integration/lib/api-client";
import { GitLabApiClient } from "@/features/code-integration/lib/gitlab-api";
import { GitHubApiClient } from "@/features/code-integration/lib/github-api";

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

// Module 35 adds a second thing a provider has to supply — how to get an access
// token (ADR-0054 §2) — and a third: how to read history (§5). Same pattern,
// registered here so "which provider" is still answered in exactly one file.

const CREDENTIALS: Record<CodeProviderId, CredentialProvider> = {
  GITLAB: GitLabCredentialProvider,
  GITHUB: GitHubCredentialProvider,
};

export function credentialFor(provider: CodeProviderId): CredentialProvider {
  return CREDENTIALS[provider];
}

const CLIENTS: Record<CodeProviderId, CodeApiClient> = {
  GITLAB: GitLabApiClient,
  GITHUB: GitHubApiClient,
};

export function apiClientFor(provider: CodeProviderId): CodeApiClient {
  return CLIENTS[provider];
}
