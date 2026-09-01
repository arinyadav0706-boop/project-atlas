import type { CodeProviderId } from "@/features/code-integration/lib/provider";

// Getting an access token from a git host (ADR-0054 §2).
//
// A second interface beside the webhook adapter, for the same reason the first
// one exists: GitLab and GitHub disagree at exactly the level a shared helper
// would have to be torn open for.
//
//   GitHub   an APP, installed on an org. There is no refresh token — an
//            installation token is minted on demand from a JWT signed with the
//            app's private key, lives an hour, and is thrown away.
//   GitLab   an APPLICATION, authorised by a user. Authorization code + PKCE,
//            then a refresh token that ROTATES on every use.
//
// The long-lived secret is in a different place for each (a deployment-wide
// private key vs a per-connection refresh token), the renewal has different
// failure modes, and only one of them can permanently break by dropping a
// database write. Nothing above this interface knows any of that.

/** What `authorizeUrl` produced, plus anything the callback will need back. */
export interface AuthStart {
  url: string;
  /** PKCE verifier, to be stored against the state and replayed on exchange. */
  codeVerifier?: string;
}

/** A credential as the provider just granted it, ready to be persisted. */
export interface GrantedCredential {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scope?: string | null;
  installationId?: string | null;
  externalAccount?: string | null;
}

/** A credential as it came back out of the database, already decrypted. */
export interface StoredCredential {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  installationId: string | null;
}

export interface AuthorizeInput {
  baseUrl: string;
  redirectUri: string;
  state: string;
}

export interface ExchangeInput {
  baseUrl: string;
  redirectUri: string;
  /** OAuth authorization code. Absent for a GitHub App install. */
  code?: string;
  codeVerifier?: string | null;
  /** GitHub App install callback. Absent for OAuth. */
  installationId?: string | null;
}

export interface CredentialProvider {
  id: CodeProviderId;
  /**
   * Whether this deployment is configured to talk to this provider at all.
   *
   * Separate from "is a connection installed": an app has to be registered by
   * somebody with admin rights on the git host, and until they have, the UI
   * should say so rather than offering a button that produces a 500.
   */
  configured(): boolean;
  /** Human-readable reason `configured()` is false, for the admin screen. */
  configurationHint(): string;
  authorizeUrl(input: AuthorizeInput): AuthStart;
  exchange(input: ExchangeInput): Promise<GrantedCredential>;
  /**
   * Produce a credential good for the next few minutes.
   *
   * Called only when `needsRefresh` says so. The result is persisted **before**
   * the token is used, because for GitLab the old refresh token is already dead
   * by the time this returns (35/BR-3).
   */
  refresh(input: { baseUrl: string; current: StoredCredential }): Promise<GrantedCredential>;
  needsRefresh(current: StoredCredential, now: Date): boolean;
}

/**
 * Renew this far ahead of expiry.
 *
 * A token that expires during a 40-minute backfill walk would fail somewhere in
 * the middle of a page loop, so the margin is generous rather than tight — the
 * cost of refreshing early is one extra request.
 */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export function expiringSoon(expiresAt: Date | null, now: Date): boolean {
  // No expiry means a token that does not expire; nothing to renew.
  if (!expiresAt) return false;
  return expiresAt.getTime() - now.getTime() < REFRESH_MARGIN_MS;
}
