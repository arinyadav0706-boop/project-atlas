import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { ReportService } from "@/features/reports/services/report.service";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type {
  CycleTimeData,
  StatusBreakdownData,
  VelocityData,
} from "@/features/reports/types/report.types";

// Integration — real Postgres. Proves the reports read paths over existing data
// (11_reports.md, ADR-0020): velocity from completed sprints, status breakdown
// from issues, cycle time from audit_logs (JSON status path), plus F-1 scope.

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
    data: { organizationId: org.id, key: tag.toUpperCase().slice(0, 8), name: `P ${tag}`, createdBy: user.id },
  });
  const actor: Actor = { userId: user.id, orgRole: "MEMBER", organizationId: org.id };
  return { org, project, user, actor };
}

async function makeIssue(
  projectId: string,
  data: { key: string; status: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE"; points?: number; sprintId?: string },
) {
  return prisma.issue.create({
    data: {
      projectId,
      key: data.key,
      type: "TASK",
      title: data.key,
      status: data.status,
      priority: "MEDIUM",
      reporterId: (await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { createdBy: true } })).createdBy!,
      rank: `r-${data.key}`,
      storyPoints: data.points ?? null,
      sprintId: data.sprintId ?? null,
    },
    select: { id: true },
  });
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Reports integration", () => {
  it("velocity sums completed story points per completed sprint", async () => {
    const { project, actor } = await seed("v1");
    const sprint = await prisma.sprint.create({
      data: { projectId: project.id, name: "Sprint 1", status: "COMPLETED", endDate: new Date(), createdBy: actor.userId },
      select: { id: true },
    });
    await makeIssue(project.id, { key: "V1-1", status: "DONE", points: 3, sprintId: sprint.id });
    await makeIssue(project.id, { key: "V1-2", status: "DONE", points: 5, sprintId: sprint.id });
    // An unfinished issue in the sprint doesn't count toward completed points.
    await makeIssue(project.id, { key: "V1-3", status: "TODO", points: 8, sprintId: sprint.id });

    const result = await ReportService.runReport(actor, project.id, "velocity");
    const data = result.data as VelocityData;
    expect(data.sprints).toHaveLength(1);
    expect(data.sprints[0]).toMatchObject({ name: "Sprint 1", points: 8, issues: 2 });
  });

  it("status breakdown counts non-deleted issues per status (all four present)", async () => {
    const { project, actor } = await seed("s1");
    await makeIssue(project.id, { key: "S1-1", status: "TODO" });
    await makeIssue(project.id, { key: "S1-2", status: "TODO" });
    await makeIssue(project.id, { key: "S1-3", status: "IN_PROGRESS" });
    await makeIssue(project.id, { key: "S1-4", status: "DONE" });

    const result = await ReportService.runReport(actor, project.id, "status-breakdown");
    const data = result.data as StatusBreakdownData;
    expect(data.total).toBe(4);
    expect(data.segments).toHaveLength(4); // TODO/IN_PROGRESS/IN_REVIEW/DONE always present
    const counts = Object.fromEntries(data.segments.map((s) => [s.status, s.count]));
    expect(counts.TODO).toBe(2);
    expect(counts.IN_PROGRESS).toBe(1);
    expect(counts.IN_REVIEW).toBe(0);
    expect(counts.DONE).toBe(1);
  });

  it("cycle time averages In-Progress→Done from audit logs", async () => {
    const { org, project, actor } = await seed("c1");
    const issue = await makeIssue(project.id, { key: "C1-1", status: "DONE" });
    const now = Date.now();
    await prisma.auditLog.createMany({
      data: [
        {
          organizationId: org.id,
          actorId: actor.userId,
          action: "ISSUE_STATUS_CHANGED",
          entityType: "Issue",
          entityId: issue.id,
          afterData: { status: "IN_PROGRESS" },
          createdAt: new Date(now - 5 * 86_400_000),
        },
        {
          organizationId: org.id,
          actorId: actor.userId,
          action: "ISSUE_STATUS_CHANGED",
          entityType: "Issue",
          entityId: issue.id,
          afterData: { status: "DONE" },
          createdAt: new Date(now - 3 * 86_400_000),
        },
      ],
    });

    const result = await ReportService.runReport(actor, project.id, "cycle-time");
    const data = result.data as CycleTimeData;
    expect(data.sampleSize).toBe(1);
    expect(data.averageDays).toBe(2); // 5d ago → 3d ago = 2 days
  });

  it("cycle time reports null with an empty sample", async () => {
    const { project, actor } = await seed("c2");
    const result = await ReportService.runReport(actor, project.id, "cycle-time");
    const data = result.data as CycleTimeData;
    expect(data.averageDays).toBeNull();
    expect(data.sampleSize).toBe(0);
  });

  it("treats a project in another org as absent (F-1) and unknown reports as not found", async () => {
    const a = await seed("f1");
    const b = await seed("f2");
    await expect(ReportService.runReport(b.actor, a.project.id, "velocity")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(ReportService.runReport(a.actor, a.project.id, "nope")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
