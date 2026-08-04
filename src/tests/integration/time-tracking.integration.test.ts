import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { WorkLogService } from "@/features/time-tracking/services/work-log.service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Tier 4 — time tracking against a REAL Postgres (ADR-0030). Proves the summary
// math, tenant scope (F-1), RBAC (VIEWER/author/LEAD), archived read-only, and
// OCC — the guarantees the unit tests mock.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}
beforeEach(reset);
afterAll(() => prisma.$disconnect());

async function seed(tag: string, status: "ACTIVE" | "ARCHIVED" = "ACTIVE") {
  const org = await prisma.organization.create({ data: { name: tag, domain: `${tag}.example.com` } });
  const mk = (role: "ADMIN" | "MEMBER", n: string) =>
    prisma.user.create({ data: { organizationId: org.id, email: `${n}-${tag}@x.com`, name: n, orgRole: role } });
  const lead = await mk("MEMBER", "lead");
  const member = await mk("MEMBER", "member");
  const viewer = await mk("MEMBER", "viewer");
  const project = await prisma.project.create({
    data: { organizationId: org.id, key: tag.toUpperCase().slice(0, 6), name: tag, createdBy: lead.id, status },
  });
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: lead.id, role: "LEAD", createdBy: lead.id },
      { projectId: project.id, userId: member.id, role: "MEMBER", createdBy: lead.id },
      { projectId: project.id, userId: viewer.id, role: "VIEWER", createdBy: lead.id },
    ],
  });
  const issue = await prisma.issue.create({
    data: {
      projectId: project.id,
      key: `${project.key}-1`,
      type: "TASK",
      title: "Task",
      reporterId: lead.id,
      rank: "a0",
    },
  });
  const actor = (u: { id: string }): Actor => ({ userId: u.id, orgRole: "MEMBER", organizationId: org.id });
  return { org, lead, member, viewer, project, issue, actor };
}

describe("logging + summary", () => {
  it("sums logged minutes and computes remaining against the estimate", async () => {
    const s = await seed("wa");
    await WorkLogService.setEstimate(s.actor(s.member), s.issue.id, { estimateMinutes: 240 });
    await WorkLogService.create(s.actor(s.member), s.issue.id, { minutes: 90, workDate: "2026-07-20" });
    await WorkLogService.create(s.actor(s.lead), s.issue.id, { minutes: 60, workDate: "2026-07-21" });

    const page = await WorkLogService.list(s.actor(s.member), s.issue.id);
    expect(page.summary).toEqual({ estimateMinutes: 240, loggedMinutes: 150, remainingMinutes: 90 });
    expect(page.items).toHaveLength(2);
    // newest-first
    expect(page.items[0]!.minutes).toBe(60);
  });

  it("reports negative remaining when over the estimate", async () => {
    const s = await seed("wb");
    await WorkLogService.setEstimate(s.actor(s.member), s.issue.id, { estimateMinutes: 60 });
    await WorkLogService.create(s.actor(s.member), s.issue.id, { minutes: 90, workDate: "2026-07-20" });
    const page = await WorkLogService.list(s.actor(s.member), s.issue.id);
    expect(page.summary.remainingMinutes).toBe(-30);
  });
});

describe("RBAC + tenancy", () => {
  it("forbids a VIEWER from logging", async () => {
    const s = await seed("wc");
    await expect(
      WorkLogService.create(s.actor(s.viewer), s.issue.id, { minutes: 30, workDate: "2026-07-20" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("404s a caller from another org (F-1)", async () => {
    const s = await seed("wd");
    const other = await seed("we");
    await expect(
      WorkLogService.create(other.actor(other.member), s.issue.id, { minutes: 30, workDate: "2026-07-20" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("409s logging on an archived project", async () => {
    const s = await seed("wf", "ARCHIVED");
    await expect(
      WorkLogService.create(s.actor(s.member), s.issue.id, { minutes: 30, workDate: "2026-07-20" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("edit + delete", () => {
  it("author edits own; a LEAD cannot edit it but can delete it", async () => {
    const s = await seed("wg");
    const created = await WorkLogService.create(s.actor(s.member), s.issue.id, { minutes: 30, workDate: "2026-07-20" });

    const edited = await WorkLogService.update(s.actor(s.member), created.id, {
      minutes: 45,
      workDate: "2026-07-20",
      expectedVersion: created.version,
    });
    expect(edited.minutes).toBe(45);

    await expect(
      WorkLogService.update(s.actor(s.lead), created.id, { minutes: 10, workDate: "2026-07-20", expectedVersion: edited.version }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    await expect(WorkLogService.delete(s.actor(s.lead), created.id)).resolves.toBeUndefined();
    const page = await WorkLogService.list(s.actor(s.member), s.issue.id);
    expect(page.items).toHaveLength(0);
    expect(page.summary.loggedMinutes).toBe(0);
  });

  it("rejects a stale edit (OCC)", async () => {
    const s = await seed("wh");
    const created = await WorkLogService.create(s.actor(s.member), s.issue.id, { minutes: 30, workDate: "2026-07-20" });
    await WorkLogService.update(s.actor(s.member), created.id, { minutes: 45, workDate: "2026-07-20", expectedVersion: 0 });
    await expect(
      WorkLogService.update(s.actor(s.member), created.id, { minutes: 60, workDate: "2026-07-20", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
