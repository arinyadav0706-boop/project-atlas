import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { HomeService } from "@/features/home/services/home.service";
import { RecentItemService } from "@/features/home/services/recent-item.service";
import { FavoriteService } from "@/features/home/services/favorite.service";
import type { Actor } from "@/shared/types/actor";

// Integration — real Postgres. Proves Home's cross-project scoping (BR-7),
// starred/recent projects, and the "Continue working" signal end to end.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed() {
  const org = await prisma.organization.create({
    data: { name: "Org", domain: "org.example.com" },
  });
  const user = await prisma.user.create({
    data: { organizationId: org.id, email: "u@example.com", name: "User" },
  });
  const mk = (key: string) =>
    prisma.project.create({
      data: { organizationId: org.id, key, name: `Project ${key}`, createdBy: user.id },
    });
  const [p1, p2, p3] = await Promise.all([mk("P1"), mk("P2"), mk("P3")]);
  // Member of p1 + p2 only (NOT p3).
  await prisma.projectMember.createMany({
    data: [
      { projectId: p1.id, userId: user.id, role: "LEAD", createdBy: user.id },
      { projectId: p2.id, userId: user.id, role: "MEMBER", createdBy: user.id },
    ],
  });
  const actor: Actor = { userId: user.id, orgRole: "MEMBER", organizationId: org.id };
  return { org, user, actor, p1, p2, p3 };
}

let n = 0;
async function assignIssue(projectId: string, userId: string, title: string) {
  n += 1;
  return prisma.issue.create({
    data: {
      projectId,
      key: `K-${n}`,
      type: "TASK",
      title,
      reporterId: userId,
      assigneeId: userId,
      status: "TODO",
      rank: `a${n}`, // distinct per issue (unique per project+status, ADR-0010)
    },
  });
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Home cross-project scope (BR-7)", () => {
  it("My Work spans my projects but never one I'm not a member of", async () => {
    const { actor, user, p1, p2, p3 } = await seed();
    await assignIssue(p1.id, user.id, "in p1");
    await assignIssue(p2.id, user.id, "in p2");
    await assignIssue(p3.id, user.id, "in p3 (not a member)");

    const ids = await HomeService.memberProjectIds(actor);
    const items = await HomeService.myWork(actor, ids);
    const titles = items.map((i) => i.title);
    expect(titles).toContain("in p1");
    expect(titles).toContain("in p2");
    expect(titles).not.toContain("in p3 (not a member)");
  });
});

describe("Continue working", () => {
  it("surfaces recently-engaged live issues, ranked", async () => {
    const { actor, user, p1 } = await seed();
    const a = await assignIssue(p1.id, user.id, "edited");
    const b = await assignIssue(p1.id, user.id, "viewed");
    await RecentItemService.record(actor, "ISSUE", b.id, "VIEWED");
    await RecentItemService.record(actor, "ISSUE", a.id, "EDITED");

    const ids = await HomeService.memberProjectIds(actor);
    const items = await HomeService.continueWorking(actor, ids);
    expect(items.map((i) => i.id)).toContain(a.id);
    expect(items.map((i) => i.id)).toContain(b.id);
  });
});

describe("Project strip", () => {
  it("returns starred projects and recent (deduped) projects", async () => {
    const { actor, p1, p2 } = await seed();
    await FavoriteService.starProject(actor, p1.id);
    await RecentItemService.record(actor, "PROJECT", p1.id, "VIEWED"); // starred → not in recent
    await RecentItemService.record(actor, "PROJECT", p2.id, "VIEWED");

    const { starredProjects, recentProjects } = await HomeService.projectStrip(actor);
    expect(starredProjects.map((p) => p.id)).toEqual([p1.id]);
    expect(recentProjects.map((p) => p.id)).toEqual([p2.id]);
  });

  it("refuses to star a project in another org (F-1)", async () => {
    const { actor } = await seed();
    const otherOrg = await prisma.organization.create({
      data: { name: "Other", domain: "other.example.com" },
    });
    const otherUser = await prisma.user.create({
      data: { organizationId: otherOrg.id, email: "o@x.com", name: "O" },
    });
    const foreign = await prisma.project.create({
      data: { organizationId: otherOrg.id, key: "X", name: "X", createdBy: otherUser.id },
    });
    await expect(FavoriteService.starProject(actor, foreign.id)).rejects.toThrow();
  });
});
