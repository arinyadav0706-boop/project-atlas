import { createSign } from "node:crypto";
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

// GitHub App credentials (ADR-0054 §2).
//
// The shape that surprises people coming from OAuth: **there is no refresh
// token, and no code exchange.** The app is installed on an organisation, which
// yields an installation id; from then on an access token is minted on demand
// by presenting a JWT signed with the app's private key. Tokens live an hour
// and are disposable, so "refresh" and "exchange" are the same operation.
//
// That is strictly better than a refresh token for our purposes — there is no
// per-connection secret that can be lost mid-rotation (compare 35/BR-3) — and
// strictly worse in one way: the private key is deployment-wide, so it is a
// single high-value secret rather than many low-value ones.

/** GitHub rejects a JWT older than 10 minutes; 9 leaves room for clock skew. */
const JWT_TTL_SECONDS = 9 * 60;
/** Backdated for the same reason: a fast clock here reads as "issued in the future". */
const JWT_BACKDATE_SECONDS = 60;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function appId(): string {
  return process.env.GITHUB_APP_ID ?? "";
}

function appSlug(): string {
  return process.env.GITHUB_APP_SLUG ?? "";
}

/**
 * The PEM, accepted either raw or base64-encoded.
 *
 * Base64 is offered because a PEM is multi-line and every deployment platform
 * mangles multi-line environment variables differently. Getting this wrong
 * produces an opaque OpenSSL error, so both forms are accepted and neither is
 * guessed at: a value that does not look like a PEM is decoded first.
 */
function privateKey(): string {
  const raw = process.env.GITHUB_APP_PRIVATE_KEY ?? "";
  if (!raw) return "";
  if (raw.includes("-----BEGIN")) return raw.replace(/\\n/g, "\n");
  try {
    return Buffer.from(raw, "base64").toString("utf8");
  } catch {
    return "";
  }
}

/** RS256, signed with the app key. GitHub accepts nothing else here. */
export function appJwt(now = new Date()): string {
  const key = privateKey();
  if (!key) throw new Error("GITHUB_APP_PRIVATE_KEY is not set.");
  const issued = Math.floor(now.getTime() / 1000) - JWT_BACKDATE_SECONDS;
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({ iat: issued, exp: issued + JWT_TTL_SECONDS, iss: appId() }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  signer.end();
  return `${header}.${payload}.${base64url(signer.sign(key))}`;
}

/** `https://github.com` → `https://api.github.com`; GHES → `<host>/api/v3`. */
export function apiRoot(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const host = (() => {
    try {
      return new URL(trimmed).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (host === "github.com" || host === "www.github.com") return "https://api.github.com";
  // GitHub Enterprise Server serves its REST API under /api/v3, not on a
  // separate hostname. Same product, different topology.
  return `${trimmed}/api/v3`;
}

interface InstallationTokenResponse {
  token?: string;
  expires_at?: string;
}

interface InstallationResponse {
  account?: { login?: string; slug?: string };
}

export const GitHubCredentialProvider: CredentialProvider = {
  id: "GITHUB",

  configured(): boolean {
    return Boolean(appId() && appSlug() && privateKey());
  },

  configurationHint(): string {
    const missing = [
      !appSlug() && "GITHUB_APP_SLUG",
      !appId() && "GITHUB_APP_ID",
      !privateKey() && "GITHUB_APP_PRIVATE_KEY",
    ].filter(Boolean);
    return `Register a GitHub App and set ${missing.join(", ")}.`;
  },

  /**
   * The install page, not an authorize page.
   *
   * The person picks which repositories the app may see; GitHub redirects back
   * with `installation_id`. There is no `code` and no PKCE — nothing is being
   * exchanged, an installation is being created.
   */
  authorizeUrl({ baseUrl, state }: AuthorizeInput): AuthStart {
    const host = baseUrl.replace(/\/+$/, "");
    const url = new URL(`${host}/apps/${appSlug()}/installations/new`);
    url.searchParams.set("state", state);
    return { url: url.toString() };
  },

  async exchange({ baseUrl, installationId }: ExchangeInput): Promise<GrantedCredential> {
    if (!installationId) {
      throw new Error("The GitHub callback carried no installation_id.");
    }
    const granted = await mintInstallationToken(baseUrl, installationId);
    // Only looked up at install time: the account name is for the admin screen
    // ("installed on acme-corp"), and refetching it on every hourly refresh
    // would be a request per hour to render a label that never changes.
    const account = await describeInstallation(baseUrl, installationId);
    return { ...granted, installationId, externalAccount: account };
  },

  async refresh({ baseUrl, current }): Promise<GrantedCredential> {
    if (!current.installationId) {
      throw new Error("This GitHub credential has no installation to renew from.");
    }
    return {
      ...(await mintInstallationToken(baseUrl, current.installationId)),
      installationId: current.installationId,
    };
  },

  needsRefresh(current: StoredCredential, now: Date): boolean {
    return expiringSoon(current.expiresAt, now);
  },
};

async function mintInstallationToken(
  baseUrl: string,
  installationId: string,
): Promise<GrantedCredential> {
  const response = await providerFetch(
    `${apiRoot(baseUrl)}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        // The JWT authenticates the APP; the token it returns authenticates the
        // INSTALLATION. Using the JWT for anything else returns 403s that read
        // like a permissions problem.
        authorization: `Bearer ${appJwt()}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  const body = (await response.json()) as InstallationTokenResponse;
  if (!body.token) {
    throw new Error("GitHub returned no installation token.");
  }
  return {
    accessToken: body.token,
    refreshToken: null,
    expiresAt: body.expires_at ? new Date(body.expires_at) : null,
  };
}

async function describeInstallation(
  baseUrl: string,
  installationId: string,
): Promise<string | null> {
  try {
    const response = await providerFetch(
      `${apiRoot(baseUrl)}/app/installations/${encodeURIComponent(installationId)}`,
      {
        headers: {
          authorization: `Bearer ${appJwt()}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
      },
    );
    const body = (await response.json()) as InstallationResponse;
    return body.account?.login ?? body.account?.slug ?? null;
  } catch {
    // A cosmetic label is not worth failing an install that otherwise worked.
    return null;
  }
}
