import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { IssueService } from "@/features/issues/services/issue.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { NotFoundError } from "@/shared/lib/errors";
import { ranksBetween } from "@/shared/lib/rank";
import type { Actor } from "@/shared/types/actor";

// Integration tests — run against a REAL Postgres (see
// docs/08_Testing/01_Testing_Strategy.md). These prove the actual Prisma
// queries and transactions that unit tests (which mock the repo) cannot see:
// keyset pagination, soft-delete filtering, the issue-key transaction under
// concurrency, and tenant isolation.

async function reset() {
  // CASCADE from organizations clears every dependent table.
  await prisma.$executeRawUnsafe(
    'TRUNCATE "organizations" RESTART IDENTITY CASCADE',
  );
}

async function seedOrgWithProject(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `Org ${tag}`, domain: `${tag}.example.com` },
  });
  const user = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}@example.com`, name: `User ${tag}` },
  });
  const project = await prisma.project.create({
    data: { organizationId: org.id, key: tag.toUpperCase(), name: `Project ${tag}`, createdBy: user.id },
  });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: user.id, role: "LEAD", createdBy: user.id },
  });
  return { org, user, project };
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("keyset pagination (IssueService.list)", () => {
  it("pages through all issues with no duplicates or gaps, stable order", async () => {
    const { org, user, project } = await seedOrgWithProject("pag");
    // 120 issues, deterministic distinct ranks for a total ordering.
    await prisma.issue.createMany({
      data: ranksBetween(null, null, 120).map((rank, i) => ({
        projectId: project.id,
        key: `PAG-${i + 1}`,
        type: "TASK" as const,
        title: `Issue ${i + 1}`,
        reporterId: user.id,
        rank,
      })),
    });
    const actor: Actor = { userId: user.id, orgRole: "MEMBER", organizationId: org.id };

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await IssueService.list(actor, project.id, {
        take: 50,
        cursor: cursor ?? undefined,
      });
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor;
      pages += 1;
      expect(page.items.length).toBeLessThanOrEqual(50);
    } while (cursor);

    expect(seen).toHaveLength(120); // no gaps
    expect(new Set(seen).size).toBe(120); // no duplicates across pages
    expect(pages).toBe(3); // 50 + 50 + 20
  });

  it("reports accurate per-status counts independent of the page", async () => {
    const { org, user, project } = await seedOrgWithProject("cnt");
    await prisma.issue.createMany({
      data: [
        ...ranksBetween(null, null, 3).map((rank, i) => ({ projectId: project.id, key: `CNT-T${i}`, type: "TASK" as const, title: "t", reporterId: user.id, status: "TODO" as const, rank })),
        ...ranksBetween(null, null, 2).map((rank, i) => ({ projectId: project.id, key: `CNT-D${i}`, type: "TASK" as const, title: "d", reporterId: user.id, status: "DONE" as const, rank })),
      ],
    });
    const actor: Actor = { userId: user.id, orgRole: "MEMBER", organizationId: org.id };
    const page = await IssueService.list(actor, project.id, { take: 2 });
    expect(page.counts).toMatchObject({ ALL: 5, TODO: 3, DONE: 2, IN_PROGRESS: 0, IN_REVIEW: 0 });
    expect(page.items).toHaveLength(2); // page is capped
  });
});

describe("soft delete", () => {
  it("a soft-deleted issue disappears from list, detail, and counts", async () => {
    const { user, project } = await seedOrgWithProject("sd");
    const issue = await IssueRepository.createWithKey({
      projectId: project.id, type: "TASK", title: "to delete", description: null,
      priority: "MEDIUM", assigneeId: null, reporterId: user.id, epicId: null,
      storyPoints: null, dueDate: null, creatorId: user.id,
    });

    await IssueRepository.softDelete(issue.id, user.id);

    const rows = await IssueRepository.listByProject(project.id, {}, { take: 50 });
    expect(rows.find((r) => r.id === issue.id)).toBeUndefined();
    expect(await IssueRepository.findDetail(issue.id)).toBeNull();
    const counts = await IssueRepository.countByStatus(project.id);
    expect(counts).toHaveLength(0);
  });
});

describe("issue key generation under concurrency", () => {
  it("assigns unique, contiguous keys when creates race (transaction holds)", async () => {
    const { user, project } = await seedOrgWithProject("key");
    const N = 25;
    const created = await Promise.all(
      Array.from({ length: N }, () =>
        IssueRepository.createWithKey({
          projectId: project.id, type: "TASK", title: "race", description: null,
          priority: "MEDIUM", assigneeId: null, reporterId: user.id, epicId: null,
          storyPoints: null, dueDate: null, creatorId: user.id,
        }),
      ),
    );
    const nums = created.map((i) => Number(i.key.split("-")[1])).sort((a, b) => a - b);
    expect(new Set(nums).size).toBe(N); // all unique — no lost updates
    expect(nums).toEqual(Array.from({ length: N }, (_, i) => i + 1)); // 1..N contiguous
  });
});

describe("tenant isolation", () => {
  it("ProjectService.list only returns the caller's own organization's projects", async () => {
    const a = await seedOrgWithProject("orga");
    await seedOrgWithProject("orgb");
    const actorA: Actor = { userId: a.user.id, orgRole: "MEMBER", organizationId: a.org.id };
    const list = await ProjectService.list(actorA);
    expect(list.map((p) => p.id)).toEqual([a.project.id]);
  });

  it("IssueRepository.listByProject is scoped to the given project only", async () => {
    const a = await seedOrgWithProject("ia");
    const b = await seedOrgWithProject("ib");
    await prisma.issue.create({ data: { projectId: a.project.id, key: "IA-1", type: "TASK", title: "a", reporterId: a.user.id, rank: "a0" } });
    await prisma.issue.create({ data: { projectId: b.project.id, key: "IB-1", type: "TASK", title: "b", reporterId: b.user.id, rank: "a0" } });
    const rowsA = await IssueRepository.listByProject(a.project.id, {}, { take: 50 });
    expect(rowsA.map((r) => r.key)).toEqual(["IA-1"]);
  });

  // F-1 (docs/08_Testing/01_Testing_Strategy.md): services scope reads to the
  // caller's organization, so a row in another org is treated as absent.
  it("F-1 fixed: cross-org get is refused — another org's issue reads as NotFound", async () => {
    const a = await seedOrgWithProject("ga");
    const b = await seedOrgWithProject("gb");
    const bIssue = await prisma.issue.create({
      data: { projectId: b.project.id, key: "GB-1", type: "TASK", title: "secret", reporterId: b.user.id, rank: "a0" },
    });
    const actorA: Actor = { userId: a.user.id, orgRole: "MEMBER", organizationId: a.org.id };
    // Tenant scope: the outsider cannot read it, and existence is not revealed.
    await expect(IssueService.get(actorA, bIssue.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
