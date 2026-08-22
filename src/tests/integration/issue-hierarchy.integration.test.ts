import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueService } from "@/features/issues/services/issue.service";
import { BoardService } from "@/features/board/services/board.service";
import { ValidationError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import { createProjectWithStatuses } from "./helpers/workflow";

// Integration — real Postgres. Proves the Epic hierarchy end to end (ADR-0026):
// create child under epic, detail shows parent + children, board filter by epic,
// delete detaches children, and the cross-project / no-nesting guards.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: tag, domain: `${tag}.example.com` },
  });
  const user = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}@x.com`, name: tag },
  });
  const project = await createProjectWithStatuses({
    data: { organizationId: org.id, key: tag.toUpperCase().slice(0, 6), name: tag, createdBy: user.id },
  });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: user.id, role: "LEAD", createdBy: user.id },
  });
  const actor: Actor = { userId: user.id, orgRole: "MEMBER", organizationId: org.id };
  return { org, user, project, actor };
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Epic hierarchy integration (ADR-0026)", () => {
  it("associates a child with an epic and exposes both directions", async () => {
    const s = await seed("h1");
    const epic = await IssueService.create(s.actor, s.project.id, {
      type: "EPIC",
      title: "Auth epic",
      priority: "MEDIUM",
    });
    const child = await IssueService.create(s.actor, s.project.id, {
      type: "STORY",
      title: "Login form",
      priority: "MEDIUM",
      epicId: epic.id,
    });

    // Child → parent epic summary.
    const childDetail = await IssueService.get(s.actor, child.id);
    expect(childDetail.epic).toMatchObject({ id: epic.id, key: epic.key });

    // Epic → child issues.
    const epicDetail = await IssueService.get(s.actor, epic.id);
    expect(epicDetail.children.map((c) => c.id)).toContain(child.id);
  });

  it("filters the board by epic and badges cards with the epic key", async () => {
    const s = await seed("h2");
    const epic = await IssueService.create(s.actor, s.project.id, { type: "EPIC", title: "E", priority: "MEDIUM" });
    const inEpic = await IssueService.create(s.actor, s.project.id, {
      type: "TASK", title: "in", priority: "MEDIUM", epicId: epic.id,
    });
    await IssueService.create(s.actor, s.project.id, { type: "TASK", title: "out", priority: "MEDIUM" });

    const board = await BoardService.getBoard(s.actor, s.project.id, { epicId: epic.id });
    const ids = board.columns.flatMap((c) => c.items.map((i) => i.id));
    expect(ids).toContain(inEpic.id);
    expect(ids).toHaveLength(1); // only the epic's child, not the loose task
    const card = board.columns.flatMap((c) => c.items).find((i) => i.id === inEpic.id);
    expect(card?.epicKey).toBe(epic.key);
  });

  it("detaches children when the epic is deleted (no orphans)", async () => {
    const s = await seed("h3");
    const epic = await IssueService.create(s.actor, s.project.id, { type: "EPIC", title: "E", priority: "MEDIUM" });
    const child = await IssueService.create(s.actor, s.project.id, {
      type: "BUG", title: "c", priority: "MEDIUM", epicId: epic.id,
    });

    await IssueService.delete(s.actor, epic.id);

    const childRow = await prisma.issue.findUnique({ where: { id: child.id } });
    expect(childRow?.epicId).toBeNull(); // detached, not orphaned
    expect(childRow?.deletedAt).toBeNull(); // child preserved
  });

  it("rejects an Epic having a parent, and cross-project parents", async () => {
    const a = await seed("h4a");
    const b = await seed("h4b");
    const epicA = await IssueService.create(a.actor, a.project.id, { type: "EPIC", title: "EA", priority: "MEDIUM" });

    // An Epic cannot be given a parent.
    await expect(
      IssueService.create(a.actor, a.project.id, {
        type: "EPIC", title: "nested", priority: "MEDIUM", epicId: epicA.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // A child in project B cannot point to an epic in project A.
    await expect(
      IssueService.create(b.actor, b.project.id, {
        type: "TASK", title: "cross", priority: "MEDIUM", epicId: epicA.id,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("removing an epic from a child clears the link", async () => {
    const s = await seed("h5");
    const epic = await IssueService.create(s.actor, s.project.id, { type: "EPIC", title: "E", priority: "MEDIUM" });
    const child = await IssueService.create(s.actor, s.project.id, {
      type: "TASK", title: "c", priority: "MEDIUM", epicId: epic.id,
    });

    const updated = await IssueService.update(s.actor, child.id, {
      epicId: null,
      expectedVersion: child.version,
    });
    expect(updated.epicId).toBeNull();
    expect(updated.epic).toBeNull();
  });
});
