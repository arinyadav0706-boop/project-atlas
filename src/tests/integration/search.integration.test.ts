import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { SearchService } from "@/features/search/services/search.service";
import type { Actor } from "@/shared/types/actor";

// Integration — real Postgres FTS (12_search.md, ADR-0021). Proves the
// tsvector/GIN read path: prefix matching, ts_rank ordering, issue-key boost,
// org scope (F-1), and soft-delete exclusion. Exercises SearchService end to
// end (service → SearchRepository → $queryRaw against the migrated indexes).

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `Org ${tag}`, domain: `${tag}.example.com` },
  });
  const user = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}@x.com`, name: `U ${tag}` },
  });
  const project = await prisma.project.create({
    data: {
      organizationId: org.id,
      key: tag.toUpperCase().slice(0, 8),
      name: `P ${tag}`,
      createdBy: user.id,
    },
  });
  const actor: Actor = { userId: user.id, orgRole: "MEMBER", organizationId: org.id };
  return { org, project, user, actor };
}

async function makeIssue(
  projectId: string,
  reporterId: string,
  data: { key: string; title: string; description?: string },
) {
  return prisma.issue.create({
    data: {
      projectId,
      key: data.key,
      type: "TASK",
      title: data.title,
      description: data.description ?? null,
      status: "TODO",
      priority: "MEDIUM",
      reporterId,
      rank: `r-${data.key}`,
    },
    select: { id: true },
  });
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Search integration (Postgres FTS)", () => {
  it("matches issue title/description and ranks the stronger match first", async () => {
    const { project, user, actor } = await seed("s1");
    await makeIssue(project.id, user.id, {
      key: "S1-1",
      title: "Fix login redirect bug",
      description: "Redirect loop after login",
    });
    await makeIssue(project.id, user.id, {
      key: "S1-2",
      title: "Unrelated dashboard tweak",
      description: "Nothing to do with auth",
    });

    const result = await SearchService.search(actor, "login redirect");
    expect(result.issues.map((i) => i.key)).toContain("S1-1");
    expect(result.issues[0]?.key).toBe("S1-1");
    expect(result.issues.some((i) => i.key === "S1-2")).toBe(false);
  });

  it("supports prefix ('as you type') matching (BR-2)", async () => {
    const { project, user, actor } = await seed("s2");
    await makeIssue(project.id, user.id, { key: "S2-1", title: "Authentication service" });

    const result = await SearchService.search(actor, "authen");
    expect(result.issues.map((i) => i.key)).toContain("S2-1");
  });

  it("boosts an exact issue-key match above body matches (BR-3)", async () => {
    const { project, user, actor } = await seed("s3");
    // A body-only match plus an issue whose KEY contains the query token.
    await makeIssue(project.id, user.id, { key: "S3-1", title: "mentions api in body", description: "api api" });
    const keyed = await makeIssue(project.id, user.id, { key: "API-1", title: "Totally different title" });

    const result = await SearchService.search(actor, "API-1");
    expect(result.issues[0]?.id).toBe(keyed.id);
  });

  it("finds projects by name and key", async () => {
    const { project, actor } = await seed("proj");
    const result = await SearchService.search(actor, "proj");
    expect(result.projects.some((p) => p.id === project.id)).toBe(true);
  });

  it("never returns another organization's matches (F-1)", async () => {
    const a = await seed("orga");
    const b = await seed("orgb");
    await makeIssue(a.project.id, a.user.id, { key: "ORGA-1", title: "Shared keyword payments" });
    await makeIssue(b.project.id, b.user.id, { key: "ORGB-1", title: "Shared keyword payments" });

    const result = await SearchService.search(b.actor, "payments");
    expect(result.issues.map((i) => i.key)).toEqual(["ORGB-1"]);
  });

  it("excludes soft-deleted issues and projects (BR-4)", async () => {
    const { project, user, actor } = await seed("del");
    const gone = await makeIssue(project.id, user.id, { key: "DEL-1", title: "deletable widget" });
    await prisma.issue.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const issueResult = await SearchService.search(actor, "deletable");
    expect(issueResult.issues).toHaveLength(0);

    await prisma.project.update({ where: { id: project.id }, data: { deletedAt: new Date() } });
    const projectResult = await SearchService.search(actor, "P del");
    expect(projectResult.projects).toHaveLength(0);
  });

  it("returns empty for a too-short query without error (BR-5)", async () => {
    const { actor } = await seed("short");
    const result = await SearchService.search(actor, "a");
    expect(result).toEqual({ issues: [], projects: [] });
  });

  it("does not throw on punctuation-only input", async () => {
    const { actor } = await seed("punc");
    const result = await SearchService.search(actor, "--");
    expect(result.issues).toEqual([]);
    expect(result.projects).toEqual([]);
  });
});
