import { createHash, randomBytes } from "node:crypto";
import type {
  AuthStart,
  AuthorizeInput,
  CredentialProvider,
  ExchangeInput,
  GrantedCredential,
  StoredCredential,
} from "@/features/code-integration/lib/credential";
import { expiringSoon } from "@/features/code-integration/lib/credential";
import { providerFetch } from "@/features/code-integration/lib/http";

// GitLab OAuth credentials (ADR-0054 §2).
//
// A conventional authorization-code flow with PKCE, and one property that
// dominates the design: **the refresh token rotates.** Every refresh returns a
// new refresh token and invalidates the one used. Persist the new pair and the
// connection keeps working forever; drop that write once and the connection is
// dead until a human re-authorises it. Not retryable — the old token is
// already gone.
//
// Hence 35/BR-3, and hence `refresh()` returning the whole credential rather
// than just a token: the caller cannot be trusted to remember to save the rest.

/** Read-only. `api` would let us write to the company's source; we never do. */
const SCOPE = "read_api";

function clientId(): string {
  return process.env.GITLAB_OAUTH_CLIENT_ID ?? "";
}

function clientSecret(): string {
  return process.env.GITLAB_OAUTH_CLIENT_SECRET ?? "";
}

/** RFC 7636: 43–128 chars of unreserved characters. 32 bytes base64url is 43. */
export function createCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  created_at?: number;
}

interface UserResponse {
  username?: string;
  name?: string;
}

export const GitLabCredentialProvider: CredentialProvider = {
  id: "GITLAB",

  configured(): boolean {
    return Boolean(clientId() && clientSecret());
  },

  configurationHint(): string {
    // Worth stating the per-instance part: an application registered on
    // gitlab.com does not work against a self-managed instance, which is the
    // first thing that confuses somebody running both.
    return (
      "Register an OAuth application on this GitLab instance with scope " +
      `${SCOPE} and set GITLAB_OAUTH_CLIENT_ID and GITLAB_OAUTH_CLIENT_SECRET. ` +
      "An application registered on gitlab.com does not work for a self-managed host."
    );
  },

  authorizeUrl({ baseUrl, redirectUri, state }: AuthorizeInput): AuthStart {
    const verifier = createCodeVerifier();
    const url = new URL(`${baseUrl.replace(/\/+$/, "")}/oauth/authorize`);
    url.searchParams.set("client_id", clientId());
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("code_challenge", codeChallenge(verifier));
    url.searchParams.set("code_challenge_method", "S256");
    return { url: url.toString(), codeVerifier: verifier };
  },

  async exchange({ baseUrl, redirectUri, code, codeVerifier }: ExchangeInput) {
    if (!code) throw new Error("The GitLab callback carried no authorization code.");
    const granted = await token(baseUrl, {
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
    });
    return { ...granted, externalAccount: await describeUser(baseUrl, granted.accessToken) };
  },

  async refresh({ baseUrl, current }) {
    if (!current.refreshToken) {
      throw new Error("This GitLab credential has no refresh token; re-authorise the connection.");
    }
    // The moment this returns, `current.refreshToken` is dead. The caller
    // persists before using anything (35/BR-3).
    return token(baseUrl, {
      grant_type: "refresh_token",
      refresh_token: current.refreshToken,
    });
  },

  needsRefresh(current: StoredCredential, now: Date): boolean {
    return expiringSoon(current.expiresAt, now);
  },
};

async function token(
  baseUrl: string,
  fields: Record<string, string>,
): Promise<GrantedCredential> {
  const response = await providerFetch(`${baseUrl.replace(/\/+$/, "")}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      ...fields,
      client_id: clientId(),
      client_secret: clientSecret(),
    }).toString(),
    // A token exchange is not idempotent — an authorization code is single-use,
    // and a retried refresh burns the rotated token. One attempt only.
    attempts: 1,
  });

  const body = (await response.json()) as TokenResponse;
  if (!body.access_token) throw new Error("GitLab returned no access token.");
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? null,
    // `created_at` is when the provider issued it; using our own clock instead
    // would inherit any skew between the two machines into the expiry.
    expiresAt: body.expires_in
      ? new Date((body.created_at ? body.created_at * 1000 : Date.now()) + body.expires_in * 1000)
      : null,
    scope: body.scope ?? null,
  };
}

async function describeUser(baseUrl: string, accessToken: string): Promise<string | null> {
  try {
    const response = await providerFetch(`${baseUrl.replace(/\/+$/, "")}/api/v4/user`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
    });
    const body = (await response.json()) as UserResponse;
    return body.username ?? body.name ?? null;
  } catch {
    return null;
  }
}
