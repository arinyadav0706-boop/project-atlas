import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueService } from "@/features/issues/services/issue.service";
import { BacklogService } from "@/features/backlog/services/backlog.service";
import { ConflictError, ValidationError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Integration — real Postgres. Proves the ADR-0013 unified-rank backlog end to
// end: the backlog lists unscheduled issues across statuses ordered by the
// shared rank, a scope=backlog reorder writes one row and survives a reload,
// and scheduled (sprintId != null) issues drop out of the view.

async function reset() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "organizations" RESTART IDENTITY CASCADE',
  );
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `Org ${tag}`, domain: `${tag}.example.com` },
  });
  const lead = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-lead@example.com`, name: `Lead ${tag}` },
  });
  const project = await prisma.project.create({
    data: { organizationId: org.id, key: tag.toUpperCase(), name: `Project ${tag}`, createdBy: lead.id },
  });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: lead.id, role: "LEAD", createdBy: lead.id },
  });
  const actor: Actor = { userId: lead.id, orgRole: "MEMBER", organizationId: org.id };
  return { org, lead, project, actor };
}

// Create N issues; each appends after the last (createWithKey), all unscheduled.
async function createIssues(actor: Actor, projectId: string, titles: string[]) {
  const made = [];
  for (const title of titles) {
    made.push(
      await IssueService.create(actor, projectId, { type: "TASK", title, priority: "MEDIUM" }),
    );
  }
  return made;
}

// Reorder helper that reads the card's current version first (ADR-0011).
async function reorderBacklog(
  actor: Actor,
  id: string,
  opts: { beforeId?: string | null; afterId?: string | null },
) {
  const row = await prisma.issue.findUnique({ where: { id }, select: { version: true } });
  return IssueService.reorder(actor, id, {
    scope: "backlog",
    ...opts,
    expectedVersion: row!.version,
  });
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Backlog view (ADR-0013) integration", () => {
  it("lists unscheduled issues ordered by rank, spanning statuses", async () => {
    const { actor, project } = await seed("bl");
    const [a, b, c] = await createIssues(actor, project.id, ["A", "B", "C"]);
    // Move B out of TODO — it must still appear in the backlog (status-agnostic).
    await IssueService.transition(actor, b!.id, "IN_PROGRESS", 0);

    const backlog = await BacklogService.getBacklog(actor, project.id, {});
    expect(backlog.items.map((i) => i.title)).toEqual(["A", "B", "C"]);
    expect(backlog.items.find((i) => i.id === b!.id)!.status).toBe("IN_PROGRESS");
    expect(backlog.nextCursor).toBeNull();
    void a;
    void c;
  });

  it("reorders within the backlog and the order survives a reload (one-row write)", async () => {
    const { actor, project } = await seed("re");
    const [a, b, c] = await createIssues(actor, project.id, ["A", "B", "C"]);

    // Move C between A and B.
    await reorderBacklog(actor, c!.id, { beforeId: a!.id, afterId: b!.id });

    const backlog = await BacklogService.getBacklog(actor, project.id, {});
    expect(backlog.items.map((i) => i.title)).toEqual(["A", "C", "B"]);

    // Exactly one row changed rank: A and B keep their original ranks.
    const rows = await prisma.issue.findMany({
      where: { projectId: project.id },
      select: { id: true, rank: true },
    });
    const rank = (id: string) => rows.find((r) => r.id === id)!.rank;
    expect(rank(a!.id) < rank(c!.id)).toBe(true);
    expect(rank(c!.id) < rank(b!.id)).toBe(true);
  });

  it("excludes issues assigned to a sprint (sprintId != null)", async () => {
    const { actor, project } = await seed("sp");
    const [a, b] = await createIssues(actor, project.id, ["A", "B"]);
    const sprint = await prisma.sprint.create({
      data: { projectId: project.id, name: "Sprint 1", createdBy: actor.userId },
    });
    await prisma.issue.update({ where: { id: b!.id }, data: { sprintId: sprint.id } });

    const backlog = await BacklogService.getBacklog(actor, project.id, {});
    expect(backlog.items.map((i) => i.id)).toEqual([a!.id]);
  });

  it("rejects a scope=backlog reorder of an issue already in a sprint", async () => {
    const { actor, project } = await seed("sr");
    const [a, b] = await createIssues(actor, project.id, ["A", "B"]);
    const sprint = await prisma.sprint.create({
      data: { projectId: project.id, name: "Sprint 1", createdBy: actor.userId },
    });
    await prisma.issue.update({ where: { id: b!.id }, data: { sprintId: sprint.id } });

    await expect(
      reorderBacklog(actor, b!.id, { beforeId: a!.id, afterId: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a status change requested under scope=backlog", async () => {
    const { actor, project } = await seed("st");
    const [a] = await createIssues(actor, project.id, ["A"]);
    const row = await prisma.issue.findUnique({ where: { id: a!.id }, select: { version: true } });
    await expect(
      IssueService.reorder(actor, a!.id, {
        scope: "backlog",
        status: "IN_PROGRESS",
        expectedVersion: row!.version,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    const fresh = await prisma.issue.findUnique({ where: { id: a!.id }, select: { status: true } });
    expect(fresh?.status).toBe("TODO");
  });

  it("keyset-paginates a large backlog in rank order", async () => {
    const { actor, project } = await seed("pg");
    const titles = Array.from({ length: 5 }, (_, n) => `I${n}`);
    await createIssues(actor, project.id, titles);

    const first = await BacklogService.getBacklog(actor, project.id, { take: 2 });
    expect(first.items.map((i) => i.title)).toEqual(["I0", "I1"]);
    expect(first.nextCursor).not.toBeNull();

    const second = await BacklogService.getBacklog(actor, project.id, {
      take: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items.map((i) => i.title)).toEqual(["I2", "I3"]);

    const third = await BacklogService.getBacklog(actor, project.id, {
      take: 2,
      cursor: second.nextCursor!,
    });
    expect(third.items.map((i) => i.title)).toEqual(["I4"]);
    expect(third.nextCursor).toBeNull();
  });
});
