import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { CodeIntegrationService } from "@/features/code-integration/services/code-integration.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { WorkflowService } from "@/features/workflow/services/workflow.service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Tier 4 — code integration against a REAL Postgres (ADR-0053).
//
// The parser and adapter are unit-tested directly. This file proves what a real
// delivery does to the database: that keys resolve inside one organization and
// not across two, that redelivery does not duplicate, that a merge request is
// one row whose state moves, and that the opt-in transition obeys the project's
// own workflow rather than bypassing it.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}
beforeEach(reset);
afterAll(() => prisma.$disconnect());

async function seed(tag: string, projectKey = "VWP") {
  const org = await prisma.organization.create({
    data: { name: tag, domain: `${tag}.example.com` },
  });
  const mk = (n: string, role: "ADMIN" | "MEMBER" = "MEMBER") =>
    prisma.user.create({
      data: { organizationId: org.id, email: `${n}-${tag}@x.com`, name: n, orgRole: role },
    });
  const admin = await mk("admin", "ADMIN");
  const lead = await mk("lead");

  const actor = (u: { id: string }, orgRole: "ADMIN" | "MEMBER" = "MEMBER"): Actor => ({
    userId: u.id,
    orgRole,
    organizationId: org.id,
  });
  const leadActor = actor(lead);
  const project = await ProjectService.create(leadActor, { key: projectKey, name: "Project" });
  const statuses = await WorkflowService.listStatuses(leadActor, project.id);
  const byCategory = Object.fromEntries(statuses.map((s) => [s.category, s]));

  const adminActor = actor(admin, "ADMIN");
  const connection = await CodeIntegrationService.create(adminActor, {
    name: "GitLab",
    provider: "GITLAB",
    baseUrl: "https://gitlab.example.com",
  });

  return { org, project, byCategory, adminActor, leadActor, connection };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

const newIssue = (s: Seeded, title = "Login is broken") =>
  IssueService.create(s.leadActor, s.project.id, { type: "BUG", title, priority: "MEDIUM" });

/** Post a delivery exactly as the endpoint would. */
const deliver = (s: Seeded, body: unknown, token?: string) =>
  CodeIntegrationService.ingest({
    connectionId: s.connection.id,
    headers: new Headers({ "x-gitlab-token": token ?? s.connection.secret }),
    rawBody: JSON.stringify(body),
  });

const pushBody = (branch: string, commits: { id: string; message: string }[] = []) => ({
  object_kind: "push",
  ref: `refs/heads/${branch}`,
  user_name: "Priya",
  project: {
    path_with_namespace: "team/service",
    web_url: "https://gitlab.example.com/team/service",
  },
  commits: commits.map((c) => ({ ...c, timestamp: "2026-08-22T10:00:00Z" })),
});

const mrBody = (over: Record<string, unknown> = {}) => ({
  object_kind: "merge_request",
  user_name: "Dev",
  project: {
    path_with_namespace: "team/service",
    web_url: "https://gitlab.example.com/team/service",
  },
  object_attributes: {
    iid: 42,
    title: "VWP-1 Add login",
    url: "https://gitlab.example.com/team/service/-/merge_requests/42",
    source_branch: "feature/VWP-1",
    state: "opened",
    updated_at: "2026-08-22T11:00:00Z",
    ...over,
  },
});

const linksOf = (issueId: string) =>
  prisma.codeLink.findMany({ where: { issueId }, orderBy: { kind: "asc" } });

describe("verification", () => {
  it("accepts the right token", async () => {
    const s = await seed("ca");
    await newIssue(s);
    expect((await deliver(s, pushBody("feature/VWP-1"))).ok).toBe(true);
  });

  it("refuses a wrong token with 401 — the one thing that must be loud (AC-8)", async () => {
    const s = await seed("cb");
    const outcome = await deliver(s, pushBody("feature/VWP-1"), "wrong");
    expect(outcome).toMatchObject({ ok: false, status: 401 });
  });

  it("a valid token with an unparseable body is a successful no-op (AC-8)", async () => {
    // GitLab disables a hook that keeps erroring, so an unmodelled or malformed
    // delivery must not look like a failure.
    const s = await seed("cc");
    const outcome = await CodeIntegrationService.ingest({
      connectionId: s.connection.id,
      headers: new Headers({ "x-gitlab-token": s.connection.secret }),
      rawBody: "not json at all",
    });
    expect(outcome).toMatchObject({ ok: true, linked: 0 });
  });

  it("an unknown connection is 404", async () => {
    const outcome = await CodeIntegrationService.ingest({
      connectionId: "nope",
      headers: new Headers(),
      rawBody: "{}",
    });
    expect(outcome).toMatchObject({ ok: false, status: 404 });
  });
});

describe("linking (AC-1, AC-2, AC-3)", () => {
  it("a push to feature/VWP-1 creates a branch link", async () => {
    const s = await seed("cd");
    const issue = await newIssue(s);
    await deliver(s, pushBody("feature/VWP-1-login"));

    const links = await linksOf(issue.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      kind: "BRANCH",
      externalId: "feature/VWP-1-login",
      repository: "team/service",
      state: "NONE",
    });
  });

  it("a commit message naming two issues links to both", async () => {
    const s = await seed("ce");
    const one = await newIssue(s, "one");
    const two = await newIssue(s, "two");
    await deliver(
      s,
      pushBody("main", [{ id: "abc123", message: `${one.key} and ${two.key} fixed` }]),
    );

    expect((await linksOf(one.id)).some((l) => l.kind === "COMMIT")).toBe(true);
    expect((await linksOf(two.id)).some((l) => l.kind === "COMMIT")).toBe(true);
    // …and no branch link, because `main` names neither of them.
    expect((await linksOf(one.id)).some((l) => l.kind === "BRANCH")).toBe(false);
  });

  it("links ONLY the commits that name the issue, not every commit in the push", async () => {
    // A branch named for the issue must not drag in "merge main into
    // feature/VWP-1" and every unrelated chore alongside it. Jira attaches a
    // commit by its own message, and so does this.
    const s = await seed("cz");
    const issue = await newIssue(s);
    await deliver(
      s,
      pushBody(`feature/${issue.key}-work`, [
        { id: "relevant1", message: `${issue.key} the actual change` },
        { id: "chore1", message: "chore: bump dependencies" },
        { id: "merge1", message: `Merge branch 'main' into feature/${issue.key}-work` },
      ]),
    );

    const commits = (await linksOf(issue.id)).filter((l) => l.kind === "COMMIT");
    expect(commits.map((c) => c.externalId).sort()).toEqual(["merge1", "relevant1"]);
    // The chore commit named nothing, so it is absent — and the merge commit
    // IS present, because its message really does contain the key.
    expect(commits.some((c) => c.externalId === "chore1")).toBe(false);
  });

  it("links NOTHING for text that only looks like a key (AC-3)", async () => {
    const s = await seed("cf");
    const issue = await newIssue(s);
    await deliver(
      s,
      pushBody("chore/encoding", [
        { id: "a1", message: "re-encode as UTF-8 per ISO-8601, patch CVE-2026-1234" },
      ]),
    );
    expect(await linksOf(issue.id)).toHaveLength(0);
  });

  it("records the first line of a commit message, not the whole body", async () => {
    const s = await seed("cg");
    const issue = await newIssue(s);
    await deliver(
      s,
      pushBody("main", [
        { id: "abc", message: `${issue.key} short summary\n\nA long body\nwith detail.` },
      ]),
    );
    const commit = (await linksOf(issue.id)).find((l) => l.kind === "COMMIT")!;
    expect(commit.title).toBe(`${issue.key} short summary`);
  });
});

describe("merge requests (AC-4, AC-5)", () => {
  it("opened then merged is ONE link whose state moves", async () => {
    const s = await seed("ch");
    const issue = await newIssue(s);

    await deliver(s, mrBody({ title: `${issue.key} Add login` }));
    let links = await linksOf(issue.id);
    const mrs = links.filter((l) => l.kind === "MERGE_REQUEST");
    expect(mrs).toHaveLength(1);
    expect(mrs[0]!.state).toBe("OPEN");

    await deliver(s, mrBody({ title: `${issue.key} Add login`, state: "merged" }));
    links = await linksOf(issue.id);
    expect(links.filter((l) => l.kind === "MERGE_REQUEST")).toHaveLength(1);
    expect(links.find((l) => l.kind === "MERGE_REQUEST")!.state).toBe("MERGED");
  });

  it("replaying the identical delivery changes nothing (AC-5)", async () => {
    const s = await seed("ci");
    const issue = await newIssue(s);
    const body = pushBody("feature/VWP-1", [{ id: "abc", message: `${issue.key} work` }]);

    await deliver(s, body);
    const first = await linksOf(issue.id);
    await deliver(s, body);
    await deliver(s, body);
    const after = await linksOf(issue.id);

    expect(after).toHaveLength(first.length);
    expect(after.map((l) => l.id).sort()).toEqual(first.map((l) => l.id).sort());
  });

  it("finds a key in the description, not only the title", async () => {
    const s = await seed("cj");
    const issue = await newIssue(s);
    await deliver(
      s,
      mrBody({ title: "Add login", description: `Also closes ${issue.key}` }),
    );
    expect((await linksOf(issue.id)).some((l) => l.kind === "MERGE_REQUEST")).toBe(true);
  });
});

describe("the transition on merge (AC-6, AC-7)", () => {
  it("does nothing when no status is configured — the default", async () => {
    const s = await seed("ck");
    const issue = await newIssue(s);
    await deliver(s, mrBody({ title: `${issue.key} x`, state: "merged" }));

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.statusId).toBe(issue.workflowStatus.id);
  });

  it("moves the issue once a status is configured (AC-6)", async () => {
    const s = await seed("cl");
    await CodeIntegrationService.update(s.adminActor, s.connection.id, {
      onMergeStatusId: s.byCategory.DONE!.id,
    });
    const issue = await newIssue(s);
    await deliver(s, mrBody({ title: `${issue.key} x`, state: "merged" }));

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.statusId).toBe(s.byCategory.DONE!.id);
    expect(after.status).toBe("DONE");
  });

  it("does not move it while the merge request is merely open", async () => {
    const s = await seed("cm");
    await CodeIntegrationService.update(s.adminActor, s.connection.id, {
      onMergeStatusId: s.byCategory.DONE!.id,
    });
    const issue = await newIssue(s);
    await deliver(s, mrBody({ title: `${issue.key} x`, state: "opened" }));

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.statusId).toBe(issue.workflowStatus.id);
  });

  it("OBEYS the project's transition rules rather than bypassing them (AC-7)", async () => {
    // The important one. A project that forbids To Do → Done must not have that
    // rule circumvented just because the move came from GitLab.
    const s = await seed("cn");
    await WorkflowService.setTransitions(s.leadActor, s.project.id, {
      enforce: true,
      transitions: [
        { fromStatusId: s.byCategory.TODO!.id, toStatusId: s.byCategory.IN_PROGRESS!.id },
      ],
    });
    await CodeIntegrationService.update(s.adminActor, s.connection.id, {
      onMergeStatusId: s.byCategory.DONE!.id,
    });
    const issue = await newIssue(s);

    const outcome = await deliver(s, mrBody({ title: `${issue.key} x`, state: "merged" }));
    // The webhook still succeeds — a refused transition is a legitimate answer,
    // not a delivery failure.
    expect(outcome.ok).toBe(true);
    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.statusId).toBe(issue.workflowStatus.id);
    // …and the link was still recorded.
    expect((await linksOf(issue.id)).length).toBeGreaterThan(0);
  });

  it("attributes the move to the CONNECTION, not to whoever pushed", async () => {
    // The person who merged may not even have an EAGLES account.
    const s = await seed("co");
    await CodeIntegrationService.update(s.adminActor, s.connection.id, {
      onMergeStatusId: s.byCategory.DONE!.id,
    });
    const issue = await newIssue(s);
    await deliver(s, mrBody({ title: `${issue.key} x`, state: "merged" }));

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.updatedBy).toBe(s.connection.id);
  });
});

describe("pipelines", () => {
  it("attaches a status to the branch link for that ref", async () => {
    const s = await seed("cp");
    const issue = await newIssue(s);
    await deliver(s, pushBody("feature/VWP-1"));
    await deliver(s, {
      object_kind: "pipeline",
      project: { path_with_namespace: "team/service", web_url: "https://g/x" },
      object_attributes: { id: 9, ref: "feature/VWP-1", status: "success" },
    });

    const branch = (await linksOf(issue.id)).find((l) => l.kind === "BRANCH")!;
    expect(branch.pipelineStatus).toBe("success");
  });
});

describe("tenant scope (AC-9)", () => {
  it("a key belonging to ANOTHER organisation links nothing", async () => {
    const mine = await seed("cq", "VWP");
    const theirs = await seed("cr", "VWP");
    const theirIssue = await newIssue(theirs);

    // My GitLab, naming a key that exists in both orgs.
    await deliver(mine, pushBody("main", [{ id: "a1", message: `${theirIssue.key} sneaky` }]));

    expect(await linksOf(theirIssue.id)).toHaveLength(0);
  });

  it("another organisation's connection cannot be read or edited", async () => {
    const mine = await seed("cs");
    const theirs = await seed("ct");
    await expect(
      CodeIntegrationService.update(theirs.adminActor, mine.connection.id, { name: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("administration (AC-10)", () => {
  it("is org ADMIN only, and the secret comes back exactly once", async () => {
    const s = await seed("cu");
    expect(s.connection.secret).toBeTruthy();

    await expect(
      CodeIntegrationService.create(s.leadActor, {
        name: "x",
        provider: "GITLAB",
        baseUrl: "https://g.example.com",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const listed = await CodeIntegrationService.list(s.adminActor);
    expect(listed).toHaveLength(1);
    expect((listed[0] as { secret?: string }).secret).toBeUndefined();
  });

  it("hands back a copy-pasteable webhook URL and the events to tick", async () => {
    const s = await seed("cv");
    const listed = await CodeIntegrationService.list(s.adminActor, "https://eagles.example.com");
    expect(listed[0]!.webhookUrl).toBe(
      `https://eagles.example.com/api/integrations/code/${s.connection.id}`,
    );
    expect(listed[0]!.eventsToEnable).toContain("Merge request events");
  });

  it("refuses a base URL that is not http(s)", async () => {
    const s = await seed("cw");
    await expect(
      CodeIntegrationService.create(s.adminActor, {
        name: "x",
        provider: "GITLAB",
        baseUrl: "javascript:alert(1)",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("a disabled connection accepts the delivery but links nothing", async () => {
    const s = await seed("cx");
    const issue = await newIssue(s);
    await CodeIntegrationService.update(s.adminActor, s.connection.id, { active: false });

    const outcome = await deliver(s, pushBody("feature/VWP-1"));
    expect(outcome.ok).toBe(true);
    expect(await linksOf(issue.id)).toHaveLength(0);
  });

  it("records lastEventAt, which answers 'is this hook wired up'", async () => {
    const s = await seed("cy");
    await newIssue(s);
    await deliver(s, pushBody("feature/VWP-1"));
    await new Promise((r) => setTimeout(r, 150));

    const listed = await CodeIntegrationService.list(s.adminActor);
    expect(listed[0]!.lastEventAt).not.toBeNull();
  });
});

// ── GitHub ──────────────────────────────────────────────────────────────────
//
// The same service, the same tables, a different provider (ADR-0053 §9). These
// tests deliberately go through `ingest` rather than the adapter, because the
// question here is not "does the adapter parse GitHub" — `github.test.ts`
// answers that — but "does a real GitHub delivery land in the database
// identically to a GitLab one, with nothing between them that knows which".

/** Seed an org whose connection is GitHub rather than GitLab. */
async function seedGitHub(tag: string, projectKey = "VWP") {
  const s = await seed(tag, projectKey);
  const connection = await CodeIntegrationService.create(s.adminActor, {
    name: "GitHub",
    provider: "GITHUB",
    baseUrl: "https://github.com",
  });
  return { ...s, connection };
}

const ghRepository = {
  full_name: "team/service",
  html_url: "https://github.com/team/service",
};

/** Post a delivery the way GitHub does: signed over the exact bytes sent. */
function deliverGitHub(
  s: Seeded,
  event: string,
  body: unknown,
  options: { secret?: string; rawBody?: string } = {},
) {
  const rawBody = options.rawBody ?? JSON.stringify(body);
  const signature = `sha256=${createHmac("sha256", options.secret ?? s.connection.secret)
    .update(rawBody, "utf8")
    .digest("hex")}`;
  return CodeIntegrationService.ingest({
    connectionId: s.connection.id,
    headers: new Headers({ "x-github-event": event, "x-hub-signature-256": signature }),
    rawBody,
  });
}

const ghPush = (branch: string, commits: { id: string; message: string }[] = []) => ({
  ref: `refs/heads/${branch}`,
  repository: ghRepository,
  pusher: { name: "priya" },
  commits: commits.map((c) => ({ ...c, timestamp: "2026-08-27T10:00:00Z" })),
});

const ghPull = (over: Record<string, unknown> = {}) => ({
  repository: ghRepository,
  pull_request: {
    number: 42,
    title: "VWP-1 Add login",
    body: null,
    html_url: "https://github.com/team/service/pull/42",
    state: "open",
    merged: false,
    head: { ref: "feature/VWP-1" },
    user: { login: "priya" },
    updated_at: "2026-08-27T11:00:00Z",
    ...over,
  },
});

describe("GitHub deliveries", () => {
  it("accepts a correctly signed push and links the branch (AC-12)", async () => {
    const s = await seedGitHub("ga");
    const issue = await newIssue(s);

    const outcome = await deliverGitHub(s, "push", ghPush("feature/VWP-1"));
    expect(outcome.ok).toBe(true);

    const links = await linksOf(issue.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ kind: "BRANCH", provider: "GITHUB", externalId: "feature/VWP-1" });
  });

  it.each([
    ["a body changed after signing", { tampered: true }],
    ["a signature from another secret", { secret: "someone-elses-secret" }],
  ])("refuses %s with 401 (AC-12)", async (_label, how) => {
    const s = await seedGitHub(_label === "a body changed after signing" ? "gb" : "gc");
    await newIssue(s);
    const body = ghPush("feature/VWP-1");

    const outcome =
      "tampered" in how
        ? await CodeIntegrationService.ingest({
            connectionId: s.connection.id,
            headers: new Headers({
              "x-github-event": "push",
              "x-hub-signature-256": `sha256=${createHmac("sha256", s.connection.secret)
                .update(JSON.stringify(body), "utf8")
                .digest("hex")}`,
            }),
            // Signed one body, sent another.
            rawBody: JSON.stringify(ghPush("feature/VWP-999")),
          })
        : await deliverGitHub(s, "push", body, { secret: how.secret });

    expect(outcome).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses a delivery with no signature header at all (AC-12)", async () => {
    const s = await seedGitHub("gd");
    const outcome = await CodeIntegrationService.ingest({
      connectionId: s.connection.id,
      headers: new Headers({ "x-github-event": "push" }),
      rawBody: JSON.stringify(ghPush("feature/VWP-1")),
    });
    expect(outcome).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses a GitLab-style verbatim token on a GitHub connection (AC-12)", async () => {
    // The proof that verification is per-provider and not shared: the exact
    // credential that works next door is rejected here.
    const s = await seedGitHub("ge");
    const outcome = await CodeIntegrationService.ingest({
      connectionId: s.connection.id,
      headers: new Headers({ "x-github-event": "push", "x-gitlab-token": s.connection.secret }),
      rawBody: JSON.stringify(ghPush("feature/VWP-1")),
    });
    expect(outcome).toMatchObject({ ok: false, status: 401 });
  });

  it("links only the commits whose OWN message names the issue", async () => {
    const s = await seedGitHub("gf");
    const issue = await newIssue(s);

    await deliverGitHub(
      s,
      "push",
      ghPush("feature/VWP-1", [
        { id: "aaaa1111", message: "VWP-1 add the form" },
        { id: "bbbb2222", message: "chore: UTF-8 and ISO-8601 handling" },
      ]),
    );

    const links = await linksOf(issue.id);
    expect(links.filter((l) => l.kind === "COMMIT").map((l) => l.externalId)).toEqual([
      "aaaa1111",
    ]);
  });

  it("shows a merged pull request as MERGED, not CLOSED (AC-13, BR-14)", async () => {
    const s = await seedGitHub("gg");
    const issue = await newIssue(s);

    await deliverGitHub(s, "pull_request", ghPull());
    expect((await linksOf(issue.id))[0]).toMatchObject({ state: "OPEN" });

    // GitHub's merged PR: state closed, merged true. Reading `state` alone
    // would put "Closed" on the panel for every merged pull request.
    await deliverGitHub(s, "pull_request", ghPull({ state: "closed", merged: true }));

    const links = await linksOf(issue.id);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ state: "MERGED", externalId: "42" });
  });

  it("fires the on-merge transition for a merged pull request (AC-13)", async () => {
    const s = await seedGitHub("gh");
    const issue = await newIssue(s);
    await CodeIntegrationService.update(s.adminActor, s.connection.id, {
      onMergeStatusId: s.byCategory.DONE!.id,
    });

    await deliverGitHub(s, "pull_request", ghPull({ state: "closed", merged: true }));

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.statusId).toBe(s.byCategory.DONE!.id);
  });

  it("does NOT transition for a pull request closed without merging", async () => {
    const s = await seedGitHub("gi");
    const issue = await newIssue(s);
    await CodeIntegrationService.update(s.adminActor, s.connection.id, {
      onMergeStatusId: s.byCategory.DONE!.id,
    });

    await deliverGitHub(s, "pull_request", ghPull({ state: "closed", merged: false }));

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.statusId).not.toBe(s.byCategory.DONE!.id);
  });

  it("attaches a check_suite conclusion to the branch link", async () => {
    const s = await seedGitHub("gj");
    const issue = await newIssue(s);
    await deliverGitHub(s, "push", ghPush("feature/VWP-1"));

    await deliverGitHub(s, "check_suite", {
      repository: ghRepository,
      check_suite: {
        head_branch: "feature/VWP-1",
        head_sha: "aaaa1111",
        status: "completed",
        conclusion: "failure",
        updated_at: "2026-08-27T12:00:00Z",
      },
    });

    const branch = (await linksOf(issue.id)).find((l) => l.kind === "BRANCH");
    expect(branch?.pipelineStatus).toBe("failure");
  });

  it("replays a delivery without duplicating anything (AC-14)", async () => {
    const s = await seedGitHub("gk");
    const issue = await newIssue(s);
    const body = ghPush("feature/VWP-1", [{ id: "aaaa1111", message: "VWP-1 add the form" }]);

    await deliverGitHub(s, "push", body);
    await deliverGitHub(s, "push", body);

    expect(await linksOf(issue.id)).toHaveLength(2); // one branch, one commit
  });

  it.each([
    ["a ping on hook creation", "ping", { zen: "Keep it logically awesome." }],
    ["a branch deletion", "push", { ...ghPush("feature/VWP-1"), deleted: true }],
    ["an issues event", "issues", { repository: ghRepository, issue: { number: 1 } }],
  ])("accepts %s and links nothing (AC-14)", async (label, event, body) => {
    const s = await seedGitHub(`gl-${event}-${label.length}`);
    const issue = await newIssue(s);

    const outcome = await deliverGitHub(s, event, body);
    expect(outcome.ok).toBe(true);
    expect(await linksOf(issue.id)).toHaveLength(0);
  });

  it("reads a form-encoded body, GitHub's default content type", async () => {
    const s = await seedGitHub("gm");
    const issue = await newIssue(s);

    const json = JSON.stringify(ghPush("feature/VWP-1"));
    // GitHub signs whatever bytes it sends, so this verifies either way — which
    // is exactly why leaving the default would fail in total silence.
    await deliverGitHub(s, "push", null, { rawBody: `payload=${encodeURIComponent(json)}` });

    expect(await linksOf(issue.id)).toHaveLength(1);
  });

  it("does not reach into another organization's issues", async () => {
    const mine = await seedGitHub("gn");
    const theirs = await seedGitHub("go");
    const theirIssue = await newIssue(theirs);

    await deliverGitHub(mine, "push", ghPush(`feature/${theirIssue.key}`));

    expect(await linksOf(theirIssue.id)).toHaveLength(0);
  });

  it("puts GitLab and GitHub links on the SAME issue, side by side (AC-15)", async () => {
    // The migration case: both hosts live at once, and the panel does not care.
    const s = await seedGitHub("gp");
    const issue = await newIssue(s);

    const gitlab = await CodeIntegrationService.create(s.adminActor, {
      name: "GitLab",
      provider: "GITLAB",
      baseUrl: "https://gitlab.example.com",
    });
    await CodeIntegrationService.ingest({
      connectionId: gitlab.id,
      headers: new Headers({ "x-gitlab-token": gitlab.secret }),
      rawBody: JSON.stringify(pushBody("feature/VWP-1")),
    });
    await deliverGitHub(s, "pull_request", ghPull());

    const links = await CodeIntegrationService.linksForIssue(issue.id);
    expect(links).toHaveLength(2);
    expect(new Set((await linksOf(issue.id)).map((l) => l.provider))).toEqual(
      new Set(["GITLAB", "GITHUB"]),
    );
  });

  it("offers GitHub's own wording for the events to tick", async () => {
    const s = await seedGitHub("gq");
    const listed = await CodeIntegrationService.list(s.adminActor);
    const github = listed.find((c) => c.provider === "GITHUB");
    expect(github?.eventsToEnable).toContain("Pull requests");
  });
});
