import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueService } from "@/features/issues/services/issue.service";
import { SprintService } from "@/features/sprints/services/sprint.service";
import { BacklogService } from "@/features/backlog/services/backlog.service";
import { ConflictError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import { createProjectWithStatuses, statusFor } from "./helpers/workflow";

// Integration — real Postgres. Proves the Sprint lifecycle + assignment end to
// end (07_sprint.md, ADR-0014): create → start (one-active) → drag assign →
// complete (incomplete return to backlog) → COMPLETED immutability.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `Org ${tag}`, domain: `${tag}.example.com` },
  });
  const lead = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-lead@example.com`, name: `Lead ${tag}` },
  });
  const project = await createProjectWithStatuses({
    data: { organizationId: org.id, key: tag.toUpperCase(), name: `Project ${tag}`, createdBy: lead.id },
  });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: lead.id, role: "LEAD", createdBy: lead.id },
  });
  const actor: Actor = { userId: lead.id, orgRole: "MEMBER", organizationId: org.id };
  return { org, lead, project, actor };
}

async function createIssues(actor: Actor, projectId: string, titles: string[]) {
  const made = [];
  for (const title of titles) {
    made.push(
      await IssueService.create(actor, projectId, { type: "TASK", title, priority: "MEDIUM" }),
    );
  }
  return made;
}

const dates = { startDate: "2026-08-01T00:00:00Z", endDate: "2026-08-14T00:00:00Z" };

async function move(
  actor: Actor,
  issueId: string,
  opts: { sprintId: string | null; beforeId?: string | null; afterId?: string | null },
) {
  const row = await prisma.issue.findUnique({ where: { id: issueId }, select: { version: true } });
  return SprintService.moveIssue(actor, issueId, { ...opts, expectedVersion: row!.version });
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Sprint lifecycle + assignment integration", () => {
  it("enforces one ACTIVE sprint per project (BR-1)", async () => {
    const { actor, project } = await seed("one");
    const a = await SprintService.create(actor, project.id, { name: "S1" });
    const b = await SprintService.create(actor, project.id, { name: "S2" });
    await SprintService.update(actor, a.id, dates);
    await SprintService.update(actor, b.id, dates);

    await SprintService.start(actor, a.id);
    await expect(SprintService.start(actor, b.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("requires dates to start (BR-2)", async () => {
    const { actor, project } = await seed("dts");
    const s = await SprintService.create(actor, project.id, { name: "S" });
    await expect(SprintService.start(actor, s.id)).rejects.toThrow();
  });

  it("assigns a backlog issue into a sprint (sprintId + rank) and back out", async () => {
    const { actor, project } = await seed("asg");
    const [i1] = await createIssues(actor, project.id, ["A"]);
    const s = await SprintService.create(actor, project.id, { name: "S" });

    await move(actor, i1!.id, { sprintId: s.id, beforeId: null, afterId: null });
    let fresh = await prisma.issue.findUnique({ where: { id: i1!.id }, select: { sprintId: true } });
    expect(fresh?.sprintId).toBe(s.id);

    // It now shows in the sprint's section, and NOT in the backlog.
    const panel = await SprintService.getPanel(actor, project.id);
    const section = panel.sprints.find((x) => x.sprint.id === s.id)!;
    expect(section.items.map((x) => x.id)).toEqual([i1!.id]);
    const backlog = await BacklogService.getBacklog(actor, project.id, {});
    expect(backlog.items.map((x) => x.id)).not.toContain(i1!.id);

    // Drag back to the backlog.
    await move(actor, i1!.id, { sprintId: null, beforeId: null, afterId: null });
    fresh = await prisma.issue.findUnique({ where: { id: i1!.id }, select: { sprintId: true } });
    expect(fresh?.sprintId).toBeNull();
  });

  it("completing returns incomplete issues to the backlog, keeps DONE ones (BR-3)", async () => {
    const { actor, project } = await seed("cmp");
    const [todo, done] = await createIssues(actor, project.id, ["todo", "done"]);
    const s = await SprintService.create(actor, project.id, { name: "S" });
    await SprintService.update(actor, s.id, dates);
    await move(actor, todo!.id, { sprintId: s.id, beforeId: null, afterId: null });
    await move(actor, done!.id, { sprintId: s.id, beforeId: null, afterId: null });
    // Walk `done` to DONE.
    for (const to of ["IN_PROGRESS", "IN_REVIEW", "DONE"] as const) {
      const v = await prisma.issue.findUnique({ where: { id: done!.id }, select: { version: true } });
      await IssueService.transition(actor, done!.id, await statusFor(project.id, to), v!.version);
    }
    await SprintService.start(actor, s.id);
    await SprintService.complete(actor, s.id);

    const todoRow = await prisma.issue.findUnique({ where: { id: todo!.id }, select: { sprintId: true } });
    const doneRow = await prisma.issue.findUnique({ where: { id: done!.id }, select: { sprintId: true } });
    expect(todoRow?.sprintId).toBeNull(); // incomplete → backlog
    expect(doneRow?.sprintId).toBe(s.id); // DONE stays in the historical record
  });

  it("completing can move incomplete issues to a follow-up PLANNED sprint (FUT-5)", async () => {
    const { actor, project } = await seed("next");
    const [todo] = await createIssues(actor, project.id, ["todo"]);
    const active = await SprintService.create(actor, project.id, { name: "Active" });
    const next = await SprintService.create(actor, project.id, { name: "Next" });
    await SprintService.update(actor, active.id, dates);
    await move(actor, todo!.id, { sprintId: active.id, beforeId: null, afterId: null });
    await SprintService.start(actor, active.id);

    await SprintService.complete(actor, active.id, next.id);

    const row = await prisma.issue.findUnique({ where: { id: todo!.id }, select: { sprintId: true } });
    expect(row?.sprintId).toBe(next.id); // moved to the follow-up, not the backlog
  });

  it("freezes a COMPLETED sprint — issues cannot be moved out (BR-5)", async () => {
    const { actor, project } = await seed("frz");
    const [i1] = await createIssues(actor, project.id, ["A"]);
    const s = await SprintService.create(actor, project.id, { name: "S" });
    await SprintService.update(actor, s.id, dates);
    // Mark it done so it stays in the sprint through completion.
    await move(actor, i1!.id, { sprintId: s.id, beforeId: null, afterId: null });
    for (const to of ["IN_PROGRESS", "IN_REVIEW", "DONE"] as const) {
      const v = await prisma.issue.findUnique({ where: { id: i1!.id }, select: { version: true } });
      await IssueService.transition(actor, i1!.id, await statusFor(project.id, to), v!.version);
    }
    await SprintService.start(actor, s.id);
    await SprintService.complete(actor, s.id);

    await expect(
      move(actor, i1!.id, { sprintId: null, beforeId: null, afterId: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("deletes a PLANNED sprint and returns its issues to the backlog", async () => {
    const { actor, project } = await seed("del");
    const [a] = await createIssues(actor, project.id, ["A"]);
    const s = await SprintService.create(actor, project.id, { name: "S" });
    await move(actor, a!.id, { sprintId: s.id, beforeId: null, afterId: null });

    await SprintService.delete(actor, s.id);

    const gone = await prisma.sprint.findFirst({ where: { id: s.id, deletedAt: null } });
    expect(gone).toBeNull();
    const issue = await prisma.issue.findUnique({ where: { id: a!.id }, select: { sprintId: true } });
    expect(issue?.sprintId).toBeNull(); // returned to the backlog
  });

  it("refuses to delete an ACTIVE sprint", async () => {
    const { actor, project } = await seed("dela");
    const s = await SprintService.create(actor, project.id, { name: "S" });
    await SprintService.update(actor, s.id, dates);
    await SprintService.start(actor, s.id);
    await expect(SprintService.delete(actor, s.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("lists completed sprints in the panel", async () => {
    const { actor, project } = await seed("hist");
    const s = await SprintService.create(actor, project.id, { name: "Past" });
    await SprintService.update(actor, s.id, dates);
    await SprintService.start(actor, s.id);
    await SprintService.complete(actor, s.id);

    const panel = await SprintService.getPanel(actor, project.id);
    expect(panel.sprints).toHaveLength(0); // no active/planned sprint
    expect(panel.completedSprints.map((x) => x.name)).toEqual(["Past"]);
  });

  it("reorders the planned-sprint queue (FUT-8)", async () => {
    const { actor, project } = await seed("queue");
    const a = await SprintService.create(actor, project.id, { name: "A" });
    const b = await SprintService.create(actor, project.id, { name: "B" });
    const c = await SprintService.create(actor, project.id, { name: "C" });

    // Created order A,B,C → move C to the front.
    await SprintService.reorderQueue(actor, project.id, [c.id, a.id, b.id]);

    const panel = await SprintService.getPanel(actor, project.id);
    expect(panel.sprints.map((s) => s.sprint.name)).toEqual(["C", "A", "B"]);
  });

  it("derives progress from the sprint's issues (BR-7)", async () => {
    const { actor, project } = await seed("prg");
    const [a, b] = await createIssues(actor, project.id, ["a", "b"]);
    const s = await SprintService.create(actor, project.id, { name: "S" });
    await move(actor, a!.id, { sprintId: s.id, beforeId: null, afterId: null });
    await move(actor, b!.id, { sprintId: s.id, beforeId: null, afterId: null });
    for (const to of ["IN_PROGRESS", "IN_REVIEW", "DONE"] as const) {
      const v = await prisma.issue.findUnique({ where: { id: a!.id }, select: { version: true } });
      await IssueService.transition(actor, a!.id, await statusFor(project.id, to), v!.version);
    }
    const panel = await SprintService.getPanel(actor, project.id);
    const section = panel.sprints.find((x) => x.sprint.id === s.id)!;
    expect(section.sprint.progress.totalIssues).toBe(2);
    expect(section.sprint.progress.doneIssues).toBe(1);
  });
});
