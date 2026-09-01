import { createServer, type Server } from "node:http";
import { generateKeyPairSync } from "node:crypto";

// A git host that answers like GitLab and GitHub, over real HTTP.
//
// This exists because of ADR-0054 §9: registering a real GitHub App and a real
// GitLab OAuth application needs admin rights on somebody's organisation, and
// until that happens there is no way to run the flow against the real thing.
// Mocking `fetch` would prove only that the code calls the functions it calls.
// A real socket proves the URL was built correctly, the form encoding is right,
// the headers arrive, the Link pagination is followed, and a 429 does what a
// 429 should.
//
// What it CANNOT prove is that the real providers behave as modelled here —
// this server is written from the same reading of the docs as the client, so a
// misreading is reproduced faithfully in both. That limitation is the whole
// point of §9 and must not be papered over when reporting what works.

export interface FakeGitHost {
  url: string;
  close(): Promise<void>;
  /** Every request path the server saw, for asserting on what was called. */
  calls: string[];
  /** Make the next N API responses 429. */
  rateLimitNext(count: number, retryAfterSeconds?: number): void;
  /** Report low remaining quota on every response from now on. */
  setLowQuota(low: boolean): void;
  /** The refresh tokens issued so far, newest last — proves rotation. */
  refreshTokensIssued: string[];
  /** Refresh tokens the server has retired; presenting one is an error. */
  spentRefreshTokens: Set<string>;
  privateKeyPem: string;
}

interface Fixture {
  /** `owner/repo` → its contents. */
  repositories: {
    externalId: string;
    path: string;
    defaultBranch: string;
    pulls: {
      number: number;
      title: string;
      body?: string | null;
      state: string;
      merged?: boolean;
      head: string;
      updatedAt: string;
    }[];
    branches: string[];
    commits: { sha: string; message: string; branch: string; at: string }[];
  }[];
}

/** Two repositories' worth of history, shared by both providers' endpoints. */
export function defaultFixture(): Fixture {
  const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const ancient = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000).toISOString();
  return {
    repositories: [
      {
        externalId: "101",
        path: "verus/web-platform",
        defaultBranch: "main",
        pulls: [
          {
            number: 318,
            title: "VWP-1 Fix the login redirect",
            body: "Also touches VWP-2.",
            state: "closed",
            merged: true,
            head: "feature/VWP-1-login",
            updatedAt: recent,
          },
          {
            number: 200,
            title: "Bump dependencies",
            state: "open",
            head: "chore/deps",
            updatedAt: recent,
          },
          {
            // Outside every sane window — proves the bound is real (35/BR-9).
            number: 7,
            title: "VWP-3 Ancient work",
            state: "closed",
            merged: true,
            head: "feature/VWP-3-old",
            updatedAt: ancient,
          },
        ],
        branches: ["main", "feature/VWP-1-login", "chore/deps"],
        commits: [
          {
            sha: "aaaa1111aaaa1111",
            message: "VWP-1 stop the double redirect",
            branch: "feature/VWP-1-login",
            at: recent,
          },
          {
            // The decoy: a generic pattern would link this to nothing real.
            sha: "bbbb2222bbbb2222",
            message: "chore: normalise UTF-8 and ISO-8601 handling",
            branch: "feature/VWP-1-login",
            at: recent,
          },
          {
            sha: "cccc3333cccc3333",
            message: "VWP-2 tidy the session cookie",
            branch: "main",
            at: recent,
          },
        ],
      },
      {
        externalId: "102",
        path: "verus/mobile",
        defaultBranch: "main",
        pulls: [],
        branches: ["main"],
        commits: [],
      },
    ],
  };
}

export async function startFakeGitHost(
  fixture: Fixture = defaultFixture(),
): Promise<FakeGitHost> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  void publicKey;

  const state = {
    calls: [] as string[],
    rateLimitRemaining: 0,
    retryAfterSeconds: 1,
    lowQuota: false,
    refreshTokensIssued: [] as string[],
    spentRefreshTokens: new Set<string>(),
    authorizationCodes: new Map<string, { verifierChallenge: string | null }>(),
  };

  const repoByPath = (path: string) =>
    fixture.repositories.find((repository) => repository.path === path);

  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
    state.calls.push(`${request.method} ${url.pathname}${url.search}`);

    const send = (
      status: number,
      body: unknown,
      headers: Record<string, string> = {},
    ) => {
      response.writeHead(status, {
        "content-type": "application/json",
        // Both providers publish quota on every response; the client stops
        // politely when it gets low (35/BR-10).
        "x-ratelimit-remaining": state.lowQuota ? "5" : "4900",
        "x-ratelimit-reset": String(Math.floor(Date.now() / 1000) + 60),
        ...headers,
      });
      response.end(JSON.stringify(body));
    };

    // Rate limiting is checked before routing so it can hit any endpoint,
    // which is how a real one behaves.
    if (state.rateLimitRemaining > 0 && !url.pathname.startsWith("/oauth/")) {
      state.rateLimitRemaining--;
      send(429, { message: "slow down" }, { "retry-after": String(state.retryAfterSeconds) });
      return;
    }

    const base = `http://${request.headers.host}`;

    // ── GitLab OAuth ────────────────────────────────────────────────────────
    if (url.pathname === "/oauth/authorize") {
      // A real provider renders a consent screen; the test drives the redirect
      // itself, so this just proves the URL was reachable and well-formed.
      const code = `code-${Math.random().toString(36).slice(2)}`;
      state.authorizationCodes.set(code, {
        verifierChallenge: url.searchParams.get("code_challenge"),
      });
      send(200, { code, state: url.searchParams.get("state") });
      return;
    }

    if (url.pathname === "/oauth/token" && request.method === "POST") {
      let body = "";
      request.on("data", (chunk) => (body += chunk));
      request.on("end", () => {
        const fields = new URLSearchParams(body);
        const grant = fields.get("grant_type");

        if (grant === "refresh_token") {
          const presented = fields.get("refresh_token") ?? "";
          // Rotation, and the failure it causes if a write is dropped
          // (35/BR-3): a spent token is dead, not merely stale.
          if (state.spentRefreshTokens.has(presented)) {
            send(401, { error: "invalid_grant", error_description: "token already used" });
            return;
          }
          state.spentRefreshTokens.add(presented);
        }

        const refresh = `refresh-${state.refreshTokensIssued.length + 1}`;
        state.refreshTokensIssued.push(refresh);
        send(200, {
          access_token: `access-${state.refreshTokensIssued.length}`,
          refresh_token: refresh,
          token_type: "bearer",
          expires_in: 7200,
          created_at: Math.floor(Date.now() / 1000),
          scope: "read_api",
        });
      });
      return;
    }

    if (url.pathname === "/api/v4/user") {
      send(200, { username: "priya", name: "Priya Sharma" });
      return;
    }

    // ── GitLab REST ─────────────────────────────────────────────────────────
    if (url.pathname === "/api/v4/projects") {
      send(
        200,
        fixture.repositories.map((repository) => ({
          id: Number(repository.externalId),
          path_with_namespace: repository.path,
          default_branch: repository.defaultBranch,
          web_url: `${base}/${repository.path}`,
        })),
      );
      return;
    }

    const glProject = /^\/api\/v4\/projects\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (glProject) {
      const repository = repoByPath(decodeURIComponent(glProject[1]!));
      if (!repository) return send(404, { message: "404 Project Not Found" });
      const rest = glProject[2]!;

      if (rest === "merge_requests") {
        const after = url.searchParams.get("updated_after");
        const since = after ? new Date(after) : new Date(0);
        send(
          200,
          repository.pulls
            .filter((pull) => new Date(pull.updatedAt) >= since)
            .map((pull) => ({
              iid: pull.number,
              title: pull.title,
              description: pull.body ?? null,
              web_url: `${base}/${repository.path}/-/merge_requests/${pull.number}`,
              source_branch: pull.head,
              state: pull.merged ? "merged" : pull.state === "closed" ? "closed" : "opened",
              author: { username: "priya" },
              updated_at: pull.updatedAt,
            })),
        );
        return;
      }

      if (rest === "repository/branches") {
        send(
          200,
          repository.branches.map((name) => ({
            name,
            web_url: `${base}/${repository.path}/-/tree/${encodeURIComponent(name)}`,
          })),
        );
        return;
      }

      if (rest === "repository/commits") {
        const ref = url.searchParams.get("ref_name");
        const since = new Date(url.searchParams.get("since") ?? 0);
        send(
          200,
          repository.commits
            .filter((commit) => commit.branch === ref && new Date(commit.at) >= since)
            .map((commit) => ({
              id: commit.sha,
              message: commit.message,
              web_url: `${base}/${repository.path}/-/commit/${commit.sha}`,
              author_name: "Priya Sharma",
              committed_date: commit.at,
            })),
        );
        return;
      }
    }

    // ── GitHub App install ──────────────────────────────────────────────────
    //
    // A real GitHub renders a repository picker here and then redirects to the
    // App's configured callback with `installation_id`. The integration tests
    // skip this by calling `completeAuthorization` directly; a browser cannot,
    // so the redirect is modelled for the manual walkthrough.
    if (/^\/apps\/[^/]+\/installations\/new$/.test(url.pathname)) {
      const callback = process.env.FAKE_CALLBACK_URL ?? "http://localhost:3000";
      const target = new URL(`${callback}/api/integrations/code/callback`);
      target.searchParams.set("installation_id", "9001");
      target.searchParams.set("setup_action", "install");
      target.searchParams.set("state", url.searchParams.get("state") ?? "");
      response.writeHead(302, { location: target.toString() });
      response.end();
      return;
    }

    // ── GitHub App ──────────────────────────────────────────────────────────
    if (/^\/api\/v3\/app\/installations\/[^/]+\/access_tokens$/.test(url.pathname)) {
      // A real GitHub verifies the JWT; asserting it is PRESENT and looks like
      // an RS256 JWT is as far as a fake can honestly go.
      const auth = request.headers.authorization ?? "";
      if (!auth.startsWith("Bearer ") || auth.split(".").length !== 3) {
        send(401, { message: "A JWT is required" });
        return;
      }
      send(201, {
        token: `ghs_${Math.random().toString(36).slice(2)}`,
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      return;
    }

    if (/^\/api\/v3\/app\/installations\/[^/]+$/.test(url.pathname)) {
      send(200, { account: { login: "verus-engineering" } });
      return;
    }

    if (url.pathname === "/api/v3/installation/repositories") {
      send(200, {
        total_count: fixture.repositories.length,
        repositories: fixture.repositories.map((repository) => ({
          id: Number(repository.externalId),
          full_name: repository.path,
          default_branch: repository.defaultBranch,
          html_url: `${base}/${repository.path}`,
        })),
      });
      return;
    }

    const ghRepo = /^\/api\/v3\/repos\/([^/]+\/[^/]+)\/(.+)$/.exec(url.pathname);
    if (ghRepo) {
      const repository = repoByPath(ghRepo[1]!);
      if (!repository) return send(404, { message: "Not Found" });
      const rest = ghRepo[2]!;

      if (rest === "pulls") {
        // GitHub has no `since` filter here, so it returns everything sorted
        // and the client stops when it passes the window — which is precisely
        // the behaviour worth testing.
        const page = Number(url.searchParams.get("page") ?? "1");
        const sorted = [...repository.pulls].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        // Two per page, so pagination is exercised rather than assumed.
        const slice = sorted.slice((page - 1) * 2, page * 2);
        const headers: Record<string, string> =
          page * 2 < sorted.length
            ? { link: `<${base}${url.pathname}?page=${page + 1}>; rel="next"` }
            : {};
        send(
          200,
          slice.map((pull) => ({
            number: pull.number,
            title: pull.title,
            body: pull.body ?? null,
            html_url: `${base}/${repository.path}/pull/${pull.number}`,
            state: pull.state,
            // The mapping 34/BR-14 is about, in its REST spelling.
            merged_at: pull.merged ? pull.updatedAt : null,
            head: { ref: pull.head },
            user: { login: "priya" },
            updated_at: pull.updatedAt,
          })),
          headers,
        );
        return;
      }

      if (rest === "branches") {
        send(
          200,
          repository.branches.map((name) => ({ name, commit: { sha: "deadbeef" } })),
        );
        return;
      }

      if (rest === "commits") {
        const ref = url.searchParams.get("sha");
        const since = new Date(url.searchParams.get("since") ?? 0);
        send(
          200,
          repository.commits
            .filter((commit) => commit.branch === ref && new Date(commit.at) >= since)
            .map((commit) => ({
              sha: commit.sha,
              html_url: `${base}/${repository.path}/commit/${commit.sha}`,
              commit: {
                message: commit.message,
                author: { name: "Priya Sharma", date: commit.at },
              },
            })),
        );
        return;
      }
    }

    send(404, { message: `no fake route for ${url.pathname}` });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    calls: state.calls,
    refreshTokensIssued: state.refreshTokensIssued,
    spentRefreshTokens: state.spentRefreshTokens,
    privateKeyPem: privateKey,
    rateLimitNext(count: number, retryAfterSeconds = 1) {
      state.rateLimitRemaining = count;
      state.retryAfterSeconds = retryAfterSeconds;
    },
    setLowQuota(low: boolean) {
      state.lowQuota = low;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
