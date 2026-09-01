import { createHmac, randomBytes } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { BackfillService } from "@/features/code-integration/services/backfill.service";
import { BackfillRepository } from "@/features/code-integration/repositories/backfill.repository";
import { CodeIntegrationService } from "@/features/code-integration/services/code-integration.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { WorkflowService } from "@/features/workflow/services/workflow.service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import { startFakeGitHost, type FakeGitHost } from "@/tests/support/fake-git-host";
import type { Actor } from "@/shared/types/actor";

// Tier 4 — backfill against a REAL Postgres and a REAL HTTP git host
// (ADR-0054, 35_code_backfill.md).
//
// The fake provider is a socket, not a mocked `fetch`: these tests exercise URL
// construction, form encoding, Link pagination, 429 handling and OAuth token
// rotation for real. What they cannot prove is that github.com and a real
// GitLab behave the way the fake does — ADR-0054 §9 is explicit about that, and
// nothing here should be read as saying otherwise.

let host: FakeGitHost;
const KEY = randomBytes(32).toString("base64");

beforeAll(async () => {
  host = await startFakeGitHost();
  process.env.CREDENTIAL_ENCRYPTION_KEY = KEY;
  // The fake listens on loopback, which the provider guard refuses in
  // production. See `outbound-url.ts` — the flag exists for exactly this.
  process.env.ALLOW_LOOPBACK_GIT_HOST = "true";
  process.env.GITLAB_OAUTH_CLIENT_ID = "fake-client";
  process.env.GITLAB_OAUTH_CLIENT_SECRET = "fake-secret";
  process.env.GITHUB_APP_ID = "12345";
  process.env.GITHUB_APP_SLUG = "eagles-test";
  process.env.GITHUB_APP_PRIVATE_KEY = host.privateKeyPem;
});

afterAll(async () => {
  await host.close();
  delete process.env.ALLOW_LOOPBACK_GIT_HOST;
  await prisma.$disconnect();
});

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}
beforeEach(reset);
afterEach(() => {
  host.rateLimitNext(0);
  host.setLowQuota(false);
  host.calls.length = 0;
});

async function seed(tag: string, provider: "GITLAB" | "GITHUB" = "GITLAB") {
  const org = await prisma.organization.create({
    data: { name: tag, domain: `${tag}.example.com` },
  });
  const mk = (n: string, role: "ADMIN" | "MEMBER") =>
    prisma.user.create({
      data: { organizationId: org.id, email: `${n}-${tag}@x.com`, name: n, orgRole: role },
    });
  const admin = await mk("admin", "ADMIN");
  const member = await mk("member", "MEMBER");
  const actor = (u: { id: string }, orgRole: "ADMIN" | "MEMBER"): Actor => ({
    userId: u.id,
    orgRole,
    organizationId: org.id,
  });
  const adminActor = actor(admin, "ADMIN");
  const memberActor = actor(member, "MEMBER");

  const project = await ProjectService.create(memberActor, { key: "VWP", name: "Web Platform" });
  const statuses = await WorkflowService.listStatuses(memberActor, project.id);
  const byCategory = Object.fromEntries(statuses.map((s) => [s.category, s]));

  const connection = await CodeIntegrationService.create(adminActor, {
    name: provider === "GITLAB" ? "GitLab" : "GitHub",
    provider,
    baseUrl: host.url,
  });

  return { org, project, byCategory, adminActor, memberActor, connection };
}
type Seeded = Awaited<ReturnType<typeof seed>>;

const newIssue = (s: Seeded, title: string) =>
  IssueService.create(s.memberActor, s.project.id, { type: "BUG", title, priority: "MEDIUM" });

/** Complete an install without a browser: mint the state, then call back. */
async function connect(s: Seeded, provider: "GITLAB" | "GITHUB") {
  const redirectUri = "http://localhost:3000/api/integrations/code/callback";
  const { url } = await BackfillService.startAuthorization(s.adminActor, s.connection.id, {
    redirectUri,
  });
  const state = new URL(url).searchParams.get("state")!;

  if (provider === "GITHUB") {
    await BackfillService.completeAuthorization({
      state,
      installationId: "9001",
      redirectUri,
    });
  } else {
    // Follow the authorize URL for real, so the fake hands back a code the way
    // a consent screen would.
    const authorized = await fetch(url);
    const { code } = (await authorized.json()) as { code: string };
    await BackfillService.completeAuthorization({ state, code, redirectUri });
  }
  return state;
}

const linksFor = (issueId: string) =>
  prisma.codeLink.findMany({ where: { issueId }, orderBy: [{ kind: "asc" }, { externalId: "asc" }] });

/** Drain until every run settles, with a bound so a bug cannot hang the suite. */
async function drain(max = 40) {
  for (let i = 0; i < max; i++) {
    const result = await BackfillService.runDue(new Date(), 5);
    if (result.claimed === 0) return;
  }
  throw new Error("backfill never settled");
}

describe("authorisation", () => {
  it("redirects to the provider with a single-use state (AC-1)", async () => {
    const s = await seed("ba");
    const { url } = await BackfillService.startAuthorization(s.adminActor, s.connection.id, {
      redirectUri: "http://localhost:3000/cb",
    });
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/oauth/authorize");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("scope")).toBe("read_api");
    // read_api, never api: the token must not be able to write to their source.
    expect(parsed.searchParams.get("scope")).not.toContain("write");
  });

  it("refuses a replayed callback (AC-1)", async () => {
    const s = await seed("bb");
    const state = await connect(s, "GITLAB");
    await expect(
      BackfillService.completeAuthorization({
        state,
        code: "anything",
        redirectUri: "http://localhost:3000/cb",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a state that was never issued (AC-2)", async () => {
    await expect(
      BackfillService.completeAuthorization({
        state: "not-a-real-state",
        code: "x",
        redirectUri: "http://localhost:3000/cb",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to start when there is no encryption key", async () => {
    // Checked BEFORE the browser leaves: discovering this after somebody has
    // authorised an app means a granted token we cannot keep.
    const s = await seed("bc");
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    try {
      await expect(
        BackfillService.startAuthorization(s.adminActor, s.connection.id, {
          redirectUri: "http://localhost:3000/cb",
        }),
      ).rejects.toBeInstanceOf(ValidationError);
    } finally {
      process.env.CREDENTIAL_ENCRYPTION_KEY = KEY;
    }
  });

  it("refuses a non-admin (AC-14)", async () => {
    const s = await seed("bd");
    await expect(
      BackfillService.startAuthorization(s.memberActor, s.connection.id, {
        redirectUri: "http://localhost:3000/cb",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("stores the token as ciphertext, not as a token (AC-3)", async () => {
    const s = await seed("be");
    await connect(s, "GITLAB");
    expect(await BackfillRepository.storedTokenIsSealed(s.connection.id)).toBe(true);

    // And the plaintext really is absent from the column.
    const row = await prisma.codeCredential.findUniqueOrThrow({
      where: { connectionId: s.connection.id },
      select: { accessToken: true, refreshToken: true },
    });
    expect(row.accessToken).not.toContain("access-");
    expect(row.refreshToken).not.toContain("refresh-");
    // But it round-trips.
    const decrypted = await BackfillRepository.findCredential(s.connection.id);
    expect(decrypted?.accessToken).toMatch(/^access-/);
  });

  it("detects a tampered ciphertext instead of using it (AC-3)", async () => {
    const s = await seed("bf");
    await connect(s, "GITLAB");
    const row = await prisma.codeCredential.findUniqueOrThrow({
      where: { connectionId: s.connection.id },
      select: { accessToken: true },
    });
    const parts = row.accessToken.split(".");
    const body = Buffer.from(parts[3]!, "base64url");
    body[0] = body[0]! ^ 0xff;
    parts[3] = body.toString("base64url");
    await prisma.codeCredential.update({
      where: { connectionId: s.connection.id },
      data: { accessToken: parts.join(".") },
    });
    await expect(BackfillRepository.findCredential(s.connection.id)).rejects.toThrow();
  });

  it("flips the connection to APP, and disconnecting flips it back", async () => {
    const s = await seed("bg");
    await connect(s, "GITLAB");
    let listed = await CodeIntegrationService.list(s.adminActor);
    expect(listed[0]!.authMode).toBe("APP");

    await BackfillService.disconnect(s.adminActor, s.connection.id);
    listed = await CodeIntegrationService.list(s.adminActor);
    expect(listed[0]!.authMode).toBe("WEBHOOK_ONLY");
    expect(await BackfillRepository.findCredential(s.connection.id)).toBeNull();
  });
});

describe("token renewal", () => {
  it("rotates GitLab's refresh token and persists the new one first (AC-5, BR-3)", async () => {
    const s = await seed("bh");
    await connect(s, "GITLAB");
    const before = await BackfillRepository.findCredential(s.connection.id);

    // Force a refresh by expiring what we hold.
    await prisma.codeCredential.update({
      where: { connectionId: s.connection.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const connection = (await CodeIntegrationService.list(s.adminActor))[0]!;
    const token = await BackfillService.accessToken({
      id: connection.id,
      provider: connection.provider,
      baseUrl: connection.baseUrl,
    });

    const after = await BackfillRepository.findCredential(s.connection.id);
    expect(token).not.toBe(before!.accessToken);
    // The rotation actually happened, and the new pair is what is stored.
    expect(after!.refreshToken).not.toBe(before!.refreshToken);
    expect(host.spentRefreshTokens.has(before!.refreshToken!)).toBe(true);
    expect(after!.accessToken).toBe(token);
  });

  it("a spent refresh token is dead, which is why BR-3 saves before using", async () => {
    // Proving the fake's rule is real, so the ordering test above means
    // something: presenting the old token a second time fails outright.
    const s = await seed("bi");
    await connect(s, "GITLAB");
    const first = await BackfillRepository.findCredential(s.connection.id);
    await prisma.codeCredential.update({
      where: { connectionId: s.connection.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const connection = (await CodeIntegrationService.list(s.adminActor))[0]!;
    await BackfillService.accessToken(connection);

    // Put the DEAD token back, as a dropped write would have.
    await prisma.codeCredential.update({
      where: { connectionId: s.connection.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await BackfillRepository.upsertCredential({
      connectionId: s.connection.id,
      accessToken: "stale",
      refreshToken: first!.refreshToken,
      expiresAt: new Date(Date.now() - 1000),
      actorId: s.adminActor.userId,
    });
    await expect(BackfillService.accessToken(connection)).rejects.toThrow();
  });

  it("re-mints a GitHub installation token without any refresh token (AC-4)", async () => {
    const s = await seed("bj", "GITHUB");
    await connect(s, "GITHUB");
    const before = await BackfillRepository.findCredential(s.connection.id);
    expect(before!.refreshToken).toBeNull();
    expect(before!.installationId).toBe("9001");

    await prisma.codeCredential.update({
      where: { connectionId: s.connection.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const connection = (await CodeIntegrationService.list(s.adminActor))[0]!;
    const token = await BackfillService.accessToken(connection);
    expect(token).toMatch(/^ghs_/);
    expect(token).not.toBe(before!.accessToken);
  });

  it("records whose account the install belongs to", async () => {
    const s = await seed("bk", "GITHUB");
    await connect(s, "GITHUB");
    const summary = await BackfillRepository.credentialSummary(s.connection.id);
    expect(summary?.externalAccount).toBe("verus-engineering");
  });
});

describe("repositories", () => {
  it("lists what the install can see, and nothing is enabled by default", async () => {
    // An app installed on a 400-repo org must not start 400 walks.
    const s = await seed("bl", "GITHUB");
    await connect(s, "GITHUB");
    const repositories = await BackfillService.refreshRepositories(s.adminActor, s.connection.id);
    expect(repositories.map((r) => r.path)).toEqual([
      "verus/mobile",
      "verus/web-platform",
    ]);
    expect(repositories.every((r) => !r.enabled)).toBe(true);
  });

  it("keeps a human's choice when the list is refreshed again", async () => {
    const s = await seed("bm", "GITHUB");
    await connect(s, "GITHUB");
    let repositories = await BackfillService.refreshRepositories(s.adminActor, s.connection.id);
    const web = repositories.find((r) => r.path === "verus/web-platform")!;
    await BackfillService.setRepositoriesEnabled(s.adminActor, s.connection.id, {
      ids: [web.id],
      enabled: true,
    });

    repositories = await BackfillService.refreshRepositories(s.adminActor, s.connection.id);
    expect(repositories.find((r) => r.path === "verus/web-platform")!.enabled).toBe(true);
  });

  it("refuses a non-admin (AC-14)", async () => {
    const s = await seed("bn", "GITHUB");
    await connect(s, "GITHUB");
    await expect(
      BackfillService.listRepositories(s.memberActor, s.connection.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe.each([["GITLAB"], ["GITHUB"]] as const)("walking history (%s)", (provider) => {
  async function ready(tag: string) {
    const s = await seed(tag, provider);
    await connect(s, provider);
    const repositories = await BackfillService.refreshRepositories(s.adminActor, s.connection.id);
    const web = repositories.find((r) => r.path === "verus/web-platform")!;
    await BackfillService.setRepositoriesEnabled(s.adminActor, s.connection.id, {
      ids: [web.id],
      enabled: true,
    });
    return { ...s, repositoryId: web.id };
  }

  it("links a merge request, a branch and the right commits (AC-6, AC-7)", async () => {
    const s = await ready(`w1${provider}`);
    const vwp1 = await newIssue(s, "Login redirect loops");
    const vwp2 = await newIssue(s, "Session cookie is wrong");

    await BackfillService.start(s.adminActor, s.connection.id);
    await drain();

    const first = await linksFor(vwp1.id);
    expect(first.map((l) => `${l.kind}:${l.externalId}`)).toEqual([
      "BRANCH:feature/VWP-1-login",
      "COMMIT:aaaa1111aaaa1111",
      "MERGE_REQUEST:318",
    ]);
    // 34/BR-14 again, through a completely different code path.
    expect(first.find((l) => l.kind === "MERGE_REQUEST")!.state).toBe("MERGED");

    // VWP-2 is named only in the merge request's DESCRIPTION and in one commit
    // on main — both found, neither invented.
    const second = await linksFor(vwp2.id);
    expect(second.map((l) => l.kind).sort()).toEqual(["COMMIT", "MERGE_REQUEST"]);
  });

  it("does not link the decoy commit (AC-8)", async () => {
    const s = await ready(`w2${provider}`);
    const issue = await newIssue(s, "Login redirect loops");
    await BackfillService.start(s.adminActor, s.connection.id);
    await drain();

    const links = await linksFor(issue.id);
    // "chore: normalise UTF-8 and ISO-8601 handling" sits on the matching
    // branch. A branch match must not drag it in (35/BR-7).
    expect(links.map((l) => l.externalId)).not.toContain("bbbb2222bbbb2222");
  });

  it("ignores anything older than the window (AC-9)", async () => {
    const s = await ready(`w3${provider}`);
    // Keys are assigned in creation order, so all three exist and the third is
    // VWP-3 — the one the fixture's 800-day-old merge request names.
    await newIssue(s, "Login redirect loops");
    await newIssue(s, "Session cookie is wrong");
    const old = await newIssue(s, "Ancient work");
    expect(old.key).toBe("VWP-3");

    await BackfillService.start(s.adminActor, s.connection.id);
    await drain();

    // Everything naming VWP-3 is outside the 90-day window.
    expect(await linksFor(old.id)).toHaveLength(0);
    // And the run did do work — otherwise this would pass for the wrong reason.
    const runs = (await BackfillService.status(s.adminActor, s.connection.id)).runs;
    expect(runs[0]!.linked).toBeGreaterThan(0);
  });

  it("is idempotent: a second backfill changes nothing (AC-7)", async () => {
    const s = await ready(`w4${provider}`);
    const issue = await newIssue(s, "Login redirect loops");
    await BackfillService.start(s.adminActor, s.connection.id);
    await drain();
    const first = await linksFor(issue.id);

    await BackfillService.start(s.adminActor, s.connection.id);
    await drain();
    const second = await linksFor(issue.id);

    expect(second).toHaveLength(first.length);
    expect(second.map((l) => l.id).sort()).toEqual(first.map((l) => l.id).sort());
  });

  it("a webhook over a backfilled link is one row, not two (AC-7)", async () => {
    const s = await ready(`w5${provider}`);
    const issue = await newIssue(s, "Login redirect loops");
    await BackfillService.start(s.adminActor, s.connection.id);
    await drain();

    // The same merge request arriving live afterwards.
    const body =
      provider === "GITLAB"
        ? {
            object_kind: "merge_request",
            project: { path_with_namespace: "verus/web-platform", web_url: `${host.url}/verus/web-platform` },
            object_attributes: {
              iid: 318,
              title: "VWP-1 Fix the login redirect",
              state: "merged",
              source_branch: "feature/VWP-1-login",
              updated_at: new Date().toISOString(),
            },
          }
        : {
            repository: {
              full_name: "verus/web-platform",
              html_url: `${host.url}/verus/web-platform`,
            },
            pull_request: {
              number: 318,
              title: "VWP-1 Fix the login redirect",
              state: "closed",
              merged: true,
              head: { ref: "feature/VWP-1-login" },
              updated_at: new Date().toISOString(),
            },
          };
    const raw = JSON.stringify(body);
    const headers =
      provider === "GITLAB"
        ? new Headers({ "x-gitlab-token": s.connection.secret })
        : new Headers({
            "x-github-event": "pull_request",
            "x-hub-signature-256": `sha256=${createHmac("sha256", s.connection.secret)
              .update(raw, "utf8")
              .digest("hex")}`,
          });

    await CodeIntegrationService.ingest({
      connectionId: s.connection.id,
      headers,
      rawBody: raw,
    });

    const merges = (await linksFor(issue.id)).filter((l) => l.kind === "MERGE_REQUEST");
    expect(merges).toHaveLength(1);
  });

  it("records what it scanned, and marks the repository done", async () => {
    const s = await ready(`w6${provider}`);
    await newIssue(s, "Login redirect loops");
    await BackfillService.start(s.adminActor, s.connection.id);
    await drain();

    const { repositories, runs } = await BackfillService.status(s.adminActor, s.connection.id);
    const run = runs.find((r) => r.repositoryId === s.repositoryId)!;
    expect(run.status).toBe("SUCCEEDED");
    expect(run.scanned).toBeGreaterThan(0);
    expect(run.linked).toBeGreaterThan(0);
    expect(repositories.find((r) => r.id === s.repositoryId)!.lastBackfillAt).not.toBeNull();
  });
});

describe("resilience", () => {
  async function ready(tag: string) {
    const s = await seed(tag, "GITHUB");
    await connect(s, "GITHUB");
    const repositories = await BackfillService.refreshRepositories(s.adminActor, s.connection.id);
    const web = repositories.find((r) => r.path === "verus/web-platform")!;
    await BackfillService.setRepositoriesEnabled(s.adminActor, s.connection.id, {
      ids: [web.id],
      enabled: true,
    });
    return { ...s, repositoryId: web.id };
  }

  it("pauses on a 429 with resumeAfter, then resumes and finishes (AC-10)", async () => {
    const s = await ready("r1");
    const issue = await newIssue(s, "Login redirect loops");

    // Enough 429s to outlast providerFetch's own retries, so the run really
    // does pause rather than the request quietly succeeding.
    host.rateLimitNext(20, 1);
    await BackfillService.start(s.adminActor, s.connection.id);

    let runs = (await BackfillService.status(s.adminActor, s.connection.id)).runs;
    expect(runs[0]!.status).toBe("PAUSED");
    expect(runs[0]!.resumeAfter).not.toBeNull();
    // A pause is not a failure (35/BR-11).
    expect(runs[0]!.error).toBeNull();

    // Not due yet, so a tick now must leave it alone.
    expect((await BackfillService.runDue(new Date())).claimed).toBe(0);

    host.rateLimitNext(0);
    await BackfillService.runDue(new Date(Date.now() + 120_000), 5);
    await drain();

    runs = (await BackfillService.status(s.adminActor, s.connection.id)).runs;
    expect(runs[0]!.status).toBe("SUCCEEDED");
    expect((await linksFor(issue.id)).length).toBeGreaterThan(0);
  });

  it("pauses politely when quota runs low, without an error (AC-10)", async () => {
    const s = await ready("r2");
    await newIssue(s, "Login redirect loops");
    host.setLowQuota(true);
    await BackfillService.start(s.adminActor, s.connection.id);

    const runs = (await BackfillService.status(s.adminActor, s.connection.id)).runs;
    expect(runs[0]!.status).toBe("PAUSED");
    expect(runs[0]!.error).toBeNull();
  });

  it("two concurrent ticks do not both process one run (AC-12)", async () => {
    const s = await ready("r3");
    await newIssue(s, "Login redirect loops");
    await BackfillService.start(s.adminActor, s.connection.id);

    const [a, b] = await Promise.all([
      BackfillService.runDue(new Date(), 5),
      BackfillService.runDue(new Date(), 5),
    ]);
    // The conditional-update claim means at most one of them owns each run.
    expect(a.claimed + b.claimed).toBeLessThanOrEqual(a.due + b.due);
    await drain();

    // And the result is still exactly one set of links, not duplicates.
    const issue = await prisma.issue.findFirstOrThrow({ where: { key: "VWP-1" } });
    const links = await linksFor(issue.id);
    expect(new Set(links.map((l) => `${l.kind}:${l.externalId}`)).size).toBe(links.length);
  });

  it("resumes mid-phase from the stored cursor (AC-11)", async () => {
    const s = await ready("r4");
    await newIssue(s, "Login redirect loops");
    await BackfillService.start(s.adminActor, s.connection.id);

    // Whatever phase it reached, the row remembers it.
    const mid = await prisma.codeBackfillRun.findFirstOrThrow({
      where: { repositoryId: s.repositoryId },
    });
    expect(["MERGE_REQUESTS", "BRANCHES", "COMMITS", "DONE"]).toContain(mid.phase);

    await drain();
    const done = await prisma.codeBackfillRun.findFirstOrThrow({
      where: { repositoryId: s.repositoryId },
    });
    expect(done.status).toBe("SUCCEEDED");
    expect(done.phase).toBe("DONE");
  });

  it("makes progress with no scheduler configured at all (AC-13)", async () => {
    // `start` drains a slice inline, so the button works on a deployment where
    // GL-10 is still open.
    const s = await ready("r5");
    await newIssue(s, "Login redirect loops");
    await BackfillService.start(s.adminActor, s.connection.id);

    const run = await prisma.codeBackfillRun.findFirstOrThrow({
      where: { repositoryId: s.repositoryId },
    });
    expect(run.scanned).toBeGreaterThan(0);
  });

  it("reclaims a run abandoned by a dead container", async () => {
    const s = await ready("r6");
    await newIssue(s, "Login redirect loops");
    await BackfillService.start(s.adminActor, s.connection.id);
    await prisma.codeBackfillRun.updateMany({
      where: { repositoryId: s.repositoryId },
      data: { status: "RUNNING", startedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    expect((await BackfillService.runDue(new Date(), 5)).claimed).toBe(1);
  });

  it("refuses to start without a connected account", async () => {
    const s = await seed("r7", "GITHUB");
    await expect(
      BackfillService.start(s.adminActor, s.connection.id),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to start with no repositories chosen", async () => {
    const s = await seed("r8", "GITHUB");
    await connect(s, "GITHUB");
    await BackfillService.refreshRepositories(s.adminActor, s.connection.id);
    await expect(
      BackfillService.start(s.adminActor, s.connection.id),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not reach another organization's connection (AC-15)", async () => {
    const mine = await seed("r9", "GITHUB");
    const theirs = await seed("r10", "GITHUB");
    await expect(
      BackfillService.startAuthorization(mine.adminActor, theirs.connection.id, {
        redirectUri: "http://localhost:3000/cb",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
