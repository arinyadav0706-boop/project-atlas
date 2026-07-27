import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueService } from "@/features/issues/services/issue.service";
import { SprintService } from "@/features/sprints/services/sprint.service";
import { ValidationError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Integration — real Postgres. Proves the backlog group-by-epic MOVES (ADR-0026):
// a backlog reorder and a sprint→backlog move can each reassign the parent epic
// in one atomic write, guards hold, and moving INTO a sprint leaves epic intact.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({ data: { name: tag, domain: `${tag}.example.com` } });
  const user = await prisma.user.create({ data: { organizationId: org.id, email: `${tag}@x.com`, name: tag } });
  const project = await prisma.project.create({
    data: { organizationId: org.id, key: tag.toUpperCase().slice(0, 6), name: tag, createdBy: user.id },
  });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: "LEAD", createdBy: user.id } });
  const actor: Actor = { userId: user.id, orgRole: "MEMBER", organizationId: org.id };
  return { org, user, project, actor };
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Backlog group-by-epic moves (ADR-0026)", () => {
  it("a backlog reorder reassigns the parent epic in one write", async () => {
    const s = await seed("bg1");
    const epic = await IssueService.create(s.actor, s.project.id, { type: "EPIC", title: "E", priority: "MEDIUM" });
    const task = await IssueService.create(s.actor, s.project.id, { type: "TASK", title: "t", priority: "MEDIUM" });
    expect(task.epicId).toBeNull();

    // Drop into the epic's backlog group.
    const moved = await IssueService.reorder(s.actor, task.id, {
      scope: "backlog",
      beforeId: null,
      afterId: null,
      epicId: epic.id,
      expectedVersion: task.version,
    });
    expect(moved.epicId).toBe(epic.id);

    // Drop into "No epic".
    const cleared = await IssueService.reorder(s.actor, task.id, {
      scope: "backlog",
      beforeId: null,
      afterId: null,
      epicId: null,
      expectedVersion: moved.version,
    });
    expect(cleared.epicId).toBeNull();
  });

  it("rejects dropping an Epic into an epic group (no nesting)", async () => {
    const s = await seed("bg2");
    const epicA = await IssueService.create(s.actor, s.project.id, { type: "EPIC", title: "A", priority: "MEDIUM" });
    const epicB = await IssueService.create(s.actor, s.project.id, { type: "EPIC", title: "B", priority: "MEDIUM" });
    await expect(
      IssueService.reorder(s.actor, epicB.id, {
        scope: "backlog",
        beforeId: null,
        afterId: null,
        epicId: epicA.id,
        expectedVersion: epicB.version,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("a sprint→backlog move can reassign the epic; a →sprint move leaves it intact", async () => {
    const s = await seed("bg3");
    const epic = await IssueService.create(s.actor, s.project.id, { type: "EPIC", title: "E", priority: "MEDIUM" });
    const task = await IssueService.create(s.actor, s.project.id, {
      type: "TASK", title: "t", priority: "MEDIUM", epicId: epic.id,
    });
    const sprint = await prisma.sprint.create({
      data: { projectId: s.project.id, name: "S1", status: "PLANNED", createdBy: s.user.id },
      select: { id: true },
    });

    // Into the sprint: epic must stay.
    const inSprint = await SprintService.moveIssue(s.actor, task.id, {
      sprintId: sprint.id,
      beforeId: null,
      afterId: null,
      expectedVersion: task.version,
    });
    expect(inSprint.epicId).toBe(epic.id);
    let row = await prisma.issue.findUnique({ where: { id: task.id } });
    expect(row?.sprintId).toBe(sprint.id);
    expect(row?.epicId).toBe(epic.id);

    // Out to the backlog "No epic" group: sprint cleared AND epic reassigned.
    await SprintService.moveIssue(s.actor, task.id, {
      sprintId: null,
      beforeId: null,
      afterId: null,
      epicId: null,
      expectedVersion: inSprint.version,
    });
    row = await prisma.issue.findUnique({ where: { id: task.id } });
    expect(row?.sprintId).toBeNull();
    expect(row?.epicId).toBeNull();
  });
});
