import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { HomeService } from "@/features/home/services/home.service";
import { RecentItemService } from "@/features/home/services/recent-item.service";
import { FavoriteService } from "@/features/home/services/favorite.service";
import { IssueService } from "@/features/issues/services/issue.service";
import type { Actor } from "@/shared/types/actor";
import { createProjectWithStatuses, statusFor } from "./helpers/workflow";

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
    createProjectWithStatuses({
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
      statusId: await statusFor(projectId),
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
    const { items } = await HomeService.myWork(actor, ids);
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
    const foreign = await createProjectWithStatuses({
      data: { organizationId: otherOrg.id, key: "X", name: "X", createdBy: otherUser.id },
    });
    await expect(FavoriteService.starProject(actor, foreign.id)).rejects.toThrow();
  });
});

describe("Summary counts (BR-10)", () => {
  // One issue per state, all assigned to me, plus one in a project I am not in.
  // The audit row behind "completed" comes from a real transition, so this also
  // proves the count reads the category the service actually writes.
  it("counts my open, due, in-progress, in-review, blocked and completed work", async () => {
    const { org, actor, user, p1, p3 } = await seed();
    const todoDue = await assignIssue(p1.id, user.id, "todo, due tomorrow");
    await prisma.issue.update({
      where: { id: todoDue.id },
      data: { dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000) },
    });
    const moving = await assignIssue(p1.id, user.id, "in progress");
    await prisma.issue.update({
      where: { id: moving.id },
      data: { status: "IN_PROGRESS", statusId: await statusFor(p1.id, "IN_PROGRESS") },
    });
    const review = await assignIssue(p1.id, user.id, "in review");
    await prisma.issue.update({
      where: { id: review.id },
      data: { status: "IN_REVIEW", statusId: await statusFor(p1.id, "IN_REVIEW") },
    });
    const finished = await assignIssue(p1.id, user.id, "completed today");
    // Walked like a person would, through the project's workflow.
    let v = finished.version;
    for (const status of ["IN_PROGRESS", "IN_REVIEW", "DONE"] as const) {
      v = (await IssueService.transition(actor, finished.id, await statusFor(p1.id, status), v)).version;
    }
    await assignIssue(p3.id, user.id, "not my project");

    // An open blocker on the review issue: blocked. A finished blocker on the
    // in-progress issue: not blocked any more.
    const blocker = await assignIssue(p1.id, user.id, "the blocker");
    await prisma.issueLink.create({
      data: { organizationId: org.id, sourceId: blocker.id, targetId: review.id, type: "BLOCKS" },
    });
    await prisma.issueLink.create({
      data: { organizationId: org.id, sourceId: finished.id, targetId: moving.id, type: "BLOCKS" },
    });

    const ids = await HomeService.memberProjectIds(actor);
    expect(await HomeService.summary(actor, ids)).toEqual({
      open: 4, // todoDue, moving, review, blocker
      dueThisWeek: 1,
      inProgress: 1,
      inReview: 1,
      blocked: 1,
      completedLast30Days: 1,
    });
  });

  it("does not count a DONE issue that never passed through a recorded transition", async () => {
    const { actor, user, p1 } = await seed();
    const silent = await assignIssue(p1.id, user.id, "set to done directly");
    await prisma.issue.update({
      where: { id: silent.id },
      data: { status: "DONE", statusId: await statusFor(p1.id, "DONE") },
    });
    const ids = await HomeService.memberProjectIds(actor);
    expect((await HomeService.summary(actor, ids)).completedLast30Days).toBe(0);
  });
});

describe("Your focus (BR-11)", () => {
  it("puts due work first, then fills with open work by priority", async () => {
    const { actor, user, p1 } = await seed();
    const low = await assignIssue(p1.id, user.id, "low, no date");
    await prisma.issue.update({ where: { id: low.id }, data: { priority: "LOW" } });
    const high = await assignIssue(p1.id, user.id, "high, no date");
    await prisma.issue.update({ where: { id: high.id }, data: { priority: "HIGH" } });
    const due = await assignIssue(p1.id, user.id, "due in two days");
    await prisma.issue.update({
      where: { id: due.id },
      data: { dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), priority: "LOW" },
    });

    const ids = await HomeService.memberProjectIds(actor);
    const { items } = await HomeService.focus(actor, ids);
    expect(items.map((i) => i.title)).toEqual(["due in two days", "high, no date", "low, no date"]);
  });
});
