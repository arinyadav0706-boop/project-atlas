import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { WorkloadService } from "@/features/workload/services/workload.service";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import { createProjectWithStatuses, statusFor } from "./helpers/workflow";

// Tier 4 — Workload against a REAL Postgres (ADR-0034). Proves the cross-project
// aggregation, the remaining-effort arithmetic against real WorkLog rows, the
// manager/admin scope, and tenant isolation.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}
beforeEach(reset);
afterAll(() => prisma.$disconnect());

let rankSeq = 0;
const nextRank = () => `r${(rankSeq++).toString().padStart(5, "0")}`;

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: tag, domain: `${tag}.example.com` },
  });
  const mk = (n: string, role: "ADMIN" | "MEMBER" = "MEMBER") =>
    prisma.user.create({
      data: { organizationId: org.id, email: `${n}-${tag}@x.com`, name: n, orgRole: role },
    });

  const admin = await mk("admin", "ADMIN");
  const mgr = await mk("mgr");
  const ana = await mk("ana");
  const bo = await mk("bo");
  const outsider = await mk("outsider");

  const team = await prisma.team.create({
    data: { organizationId: org.id, name: "Squad", managerId: mgr.id },
  });
  const otherTeam = await prisma.team.create({
    data: { organizationId: org.id, name: "Other Squad" },
  });
  await prisma.teamMembership.createMany({
    data: [
      { teamId: team.id, userId: ana.id },
      { teamId: team.id, userId: bo.id },
      { teamId: otherTeam.id, userId: outsider.id },
    ],
  });

  // Two projects: the point is that one person's load spans both (BR-3).
  const alpha = await createProjectWithStatuses({
    data: { organizationId: org.id, key: `A${tag}`, name: "Alpha" },
  });
  const beta = await createProjectWithStatuses({
    data: { organizationId: org.id, key: `B${tag}`, name: "Beta" },
  });

  const issue = async (opts: {
    projectId: string;
    key: string;
    assigneeId: string;
    status?: "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
    estimateMinutes?: number | null;
  }) =>
    prisma.issue.create({
      data: {
        projectId: opts.projectId,
        key: opts.key,
        type: "TASK",
        title: opts.key,
        status: opts.status ?? "TODO",
        statusId: await statusFor(opts.projectId, opts.status ?? "TODO"),
        priority: "MEDIUM",
        assigneeId: opts.assigneeId,
        reporterId: admin.id,
        estimateMinutes: opts.estimateMinutes ?? null,
        rank: nextRank(),
      },
    });

  return {
    org, admin, mgr, ana, bo, outsider, team, otherTeam, alpha, beta, issue,
    adminActor: { userId: admin.id, orgRole: "ADMIN", organizationId: org.id } as Actor,
    mgrActor: { userId: mgr.id, orgRole: "MEMBER", organizationId: org.id } as Actor,
    anaActor: { userId: ana.id, orgRole: "MEMBER", organizationId: org.id } as Actor,
  };
}

describe("aggregation across projects (BR-1, BR-3)", () => {
  it("sums remaining effort over every project, net of logged time", async () => {
    const s = await seed("wa");
    const i1 = await s.issue({ projectId: s.alpha.id, key: "A-1", assigneeId: s.ana.id, estimateMinutes: 480 });
    await s.issue({ projectId: s.beta.id, key: "B-1", assigneeId: s.ana.id, estimateMinutes: 120 });
    await prisma.workLog.create({
      data: { issueId: i1.id, userId: s.ana.id, minutes: 180, workDate: new Date() },
    });

    const res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    const ana = res.rows.find((r) => r.userId === s.ana.id)!;

    expect(ana.openIssues).toBe(2);
    expect(ana.estimatedMinutes).toBe(600);
    expect(ana.loggedMinutes).toBe(180);
    expect(ana.remainingMinutes).toBe(420); // (480-180) + 120
    expect(ana.status).toBe("LIGHT");
  });

  it("drops an issue from the load the moment it is DONE (BR-2)", async () => {
    const s = await seed("wb");
    const i = await s.issue({ projectId: s.alpha.id, key: "A-1", assigneeId: s.ana.id, estimateMinutes: 6000 });

    let res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    expect(res.rows.find((r) => r.userId === s.ana.id)!.status).toBe("OVERLOADED");

    await prisma.issue.update({ where: { id: i.id }, data: { status: "DONE" } });

    res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    const ana = res.rows.find((r) => r.userId === s.ana.id)!;
    expect(ana.openIssues).toBe(0);
    expect(ana.status).toBe("IDLE");
  });

  it("ignores soft-deleted issues and soft-deleted work logs", async () => {
    const s = await seed("wc");
    const gone = await s.issue({ projectId: s.alpha.id, key: "A-1", assigneeId: s.ana.id, estimateMinutes: 300 });
    await prisma.issue.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const live = await s.issue({ projectId: s.alpha.id, key: "A-2", assigneeId: s.ana.id, estimateMinutes: 300 });
    const log = await prisma.workLog.create({
      data: { issueId: live.id, userId: s.ana.id, minutes: 100, workDate: new Date() },
    });
    await prisma.workLog.update({ where: { id: log.id }, data: { deletedAt: new Date() } });

    const res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    const ana = res.rows.find((r) => r.userId === s.ana.id)!;
    expect(ana.openIssues).toBe(1);
    expect(ana.loggedMinutes).toBe(0);
    expect(ana.remainingMinutes).toBe(300);
  });

  it("counts unestimated work without inventing effort (BR-4)", async () => {
    const s = await seed("wd");
    await s.issue({ projectId: s.alpha.id, key: "A-1", assigneeId: s.ana.id, estimateMinutes: null });

    const res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    const ana = res.rows.find((r) => r.userId === s.ana.id)!;
    expect(ana.openIssues).toBe(1);
    expect(ana.unestimated).toBe(1);
    expect(ana.remainingMinutes).toBe(0);
    expect(ana.status).toBe("LIGHT");
    expect(res.totals.unestimated).toBe(1);
  });

  it("clamps an overrun to zero (BR-1)", async () => {
    const s = await seed("we");
    const i = await s.issue({ projectId: s.alpha.id, key: "A-1", assigneeId: s.ana.id, estimateMinutes: 60 });
    await prisma.workLog.create({
      data: { issueId: i.id, userId: s.ana.id, minutes: 600, workDate: new Date() },
    });

    const res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    expect(res.rows.find((r) => r.userId === s.ana.id)!.remainingMinutes).toBe(0);
  });

  it("sorts most-loaded first and totals the team (BR-10)", async () => {
    const s = await seed("wf");
    await s.issue({ projectId: s.alpha.id, key: "A-1", assigneeId: s.ana.id, estimateMinutes: 60 });
    await s.issue({ projectId: s.alpha.id, key: "A-2", assigneeId: s.bo.id, estimateMinutes: 6000 });

    const res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    expect(res.rows.map((r) => r.userId)).toEqual([s.bo.id, s.ana.id]);
    expect(res.totals.people).toBe(2);
    expect(res.totals.remainingMinutes).toBe(6060);
    expect(res.totals.overloaded).toBe(1);
  });
});

describe("the organization's working week (ADR-0034 amendment)", () => {
  it("re-bands the SAME work when the company works 6 days instead of 5", async () => {
    const s = await seed("wz");
    // 100 hours queued.
    await s.issue({ projectId: s.alpha.id, key: "A-1", assigneeId: s.ana.id, estimateMinutes: 6000 });

    let res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    let ana = res.rows.find((r) => r.userId === s.ana.id)!;
    expect(res.workingWeek.label).toBe("8h × 5 days = 40h week");
    expect(ana.weeksOfWork).toBe(2.5);
    expect(ana.status).toBe("OVERLOADED");

    await prisma.organization.update({
      where: { id: s.org.id },
      data: { workingDaysPerWeek: 6 },
    });

    res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    ana = res.rows.find((r) => r.userId === s.ana.id)!;
    expect(res.workingWeek.label).toBe("8h × 6 days = 48h week");
    expect(res.workingWeek.weeklyMinutes).toBe(2880);
    expect(ana.weeksOfWork).toBe(2.1); // 6000 / 2880
  });

  it("defaults an untouched organization to a 40-hour week", async () => {
    const s = await seed("wy");
    const res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    expect(res.workingWeek.minutesPerDay).toBe(480);
    expect(res.workingWeek.daysPerWeek).toBe(5);
  });
});

describe("scope and isolation (BR-7, BR-8, BR-9)", () => {
  it("shows a manager only their team's direct members", async () => {
    const s = await seed("wg");
    const res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    expect(res.teams.map((t) => t.id)).toEqual([s.team.id]);
    expect(res.rows.map((r) => r.userId).sort()).toEqual([s.ana.id, s.bo.id].sort());
  });

  it("404s a team the manager does not manage", async () => {
    const s = await seed("wh");
    await expect(
      WorkloadService.getWorkload(s.mgrActor, s.otherTeam.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("gives an org admin every team in the organization", async () => {
    const s = await seed("wi");
    const res = await WorkloadService.getWorkload(s.adminActor);
    expect(res.teams.map((t) => t.id).sort()).toEqual([s.team.id, s.otherTeam.id].sort());
  });

  it("gives a plain member an empty scope, not an error", async () => {
    const s = await seed("wj");
    const res = await WorkloadService.getWorkload(s.anaActor);
    expect(res.teams).toEqual([]);
    expect(res.selectedTeamId).toBeNull();
  });

  it("404s a team belonging to another organization (F-1)", async () => {
    const s = await seed("wk");
    const other = await seed("wl");
    await expect(
      WorkloadService.getWorkload(other.adminActor, s.team.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("excludes deactivated accounts from the team's rows", async () => {
    const s = await seed("wm");
    await prisma.user.update({ where: { id: s.bo.id }, data: { isActive: false } });
    const res = await WorkloadService.getWorkload(s.mgrActor, s.team.id);
    expect(res.rows.map((r) => r.userId)).toEqual([s.ana.id]);
  });
});

describe("drill-in (BR-11)", () => {
  it("lists only that person's open issues, most-remaining first", async () => {
    const s = await seed("wn");
    await s.issue({ projectId: s.alpha.id, key: "A-1", assigneeId: s.ana.id, estimateMinutes: 60 });
    await s.issue({ projectId: s.beta.id, key: "B-1", assigneeId: s.ana.id, estimateMinutes: 900 });
    await s.issue({ projectId: s.alpha.id, key: "A-2", assigneeId: s.ana.id, status: "DONE", estimateMinutes: 999 });
    await s.issue({ projectId: s.alpha.id, key: "A-3", assigneeId: s.bo.id, estimateMinutes: 120 });

    const issues = await WorkloadService.getUserIssues(s.mgrActor, s.ana.id);
    expect(issues.map((i) => i.key)).toEqual(["B-1", "A-1"]);
    expect(issues[0]!.projectName).toBe("Beta");
  });

  it("404s a person outside the manager's scope", async () => {
    const s = await seed("wo");
    await expect(
      WorkloadService.getUserIssues(s.mgrActor, s.outsider.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s a person in another organization (F-1)", async () => {
    const s = await seed("wp");
    const other = await seed("wq");
    await expect(
      WorkloadService.getUserIssues(other.adminActor, s.ana.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lets a plain member see their own open work", async () => {
    const s = await seed("wr");
    await s.issue({ projectId: s.alpha.id, key: "A-1", assigneeId: s.ana.id, estimateMinutes: 60 });
    const issues = await WorkloadService.getUserIssues(s.anaActor, s.ana.id);
    expect(issues.map((i) => i.key)).toEqual(["A-1"]);
  });
});
