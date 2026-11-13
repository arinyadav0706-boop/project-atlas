import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { TimesheetApprovalService } from "@/features/timesheets/services/timesheet-approval.service";
import { WorkLogService } from "@/features/time-tracking/services/work-log.service";
import { addDays, todayIn } from "@/features/timesheets/lib/period";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import { createProjectWithStatuses, statusFor } from "./helpers/workflow";

// Tier 4 — Timesheets against a REAL Postgres (ADR-0059, 37_timesheets.md).
// Proves the lifecycle (submit → approve → lock; submit → return →
// resubmit), who may approve what, immutability after lock — from the grid
// AND the issue page — and that the database CHECKs hold.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}
beforeEach(reset);
afterAll(() => prisma.$disconnect());

let rankSeq = 0;
const nextRank = () => `r${(rankSeq++).toString().padStart(5, "0")}`;

const actorOf = (u: { id: string; orgRole: "ADMIN" | "MEMBER"; organizationId: string }): Actor => ({
  userId: u.id,
  orgRole: u.orgRole,
  organizationId: u.organizationId,
});

async function seed(tag: string, opts: { relations?: ("REPORTING" | "FUNCTIONAL" | "PROJECT")[] } = {}) {
  const org = await prisma.organization.create({ data: { name: tag, domain: `${tag}.example.com` } });
  // The org's first policy, set up front so a test can choose its approvers;
  // the service's own default is then a no-op (same effectiveFrom).
  await prisma.timesheetPolicy.create({
    data: {
      organizationId: org.id,
      effectiveFrom: new Date("2000-01-03T00:00:00.000Z"),
      timezone: "UTC",
      approverRelations: opts.relations ?? ["REPORTING"],
    },
  });
  const mk = (n: string, role: "ADMIN" | "MEMBER" = "MEMBER") =>
    prisma.user.create({ data: { organizationId: org.id, email: `${n}-${tag}@x.com`, name: n, orgRole: role } });
  const admin = await mk("admin", "ADMIN");
  const mgr = await mk("mgr");
  const ana = await mk("ana");
  const bo = await mk("bo");
  const lee = await mk("lee");

  const team = await prisma.team.create({ data: { organizationId: org.id, name: "Squad", managerId: mgr.id } });
  await prisma.teamMembership.createMany({
    data: [
      { teamId: team.id, userId: ana.id },
      { teamId: team.id, userId: bo.id },
    ],
  });
  const alpha = await createProjectWithStatuses({ data: { organizationId: org.id, key: `A${tag}`, name: "Alpha" } });
  await prisma.projectMember.createMany({
    data: [
      { projectId: alpha.id, userId: ana.id, role: "MEMBER" },
      { projectId: alpha.id, userId: bo.id, role: "MEMBER" },
      { projectId: alpha.id, userId: lee.id, role: "LEAD" },
    ],
  });
  const issue = async (key: string) =>
    prisma.issue.create({
      data: {
        projectId: alpha.id,
        key,
        type: "TASK",
        title: key,
        status: "TODO",
        statusId: await statusFor(alpha.id, "TODO"),
        priority: "MEDIUM",
        reporterId: admin.id,
        rank: nextRank(),
      },
    });
  const i1 = await issue(`A${tag}-1`);
  const i2 = await issue(`A${tag}-2`);

  const period = await TimesheetService.currentPeriodStart(actorOf(ana));
  return {
    org, admin, mgr, ana, bo, lee, team, alpha, i1, i2, period,
    // A day in this period that is never in the future: the period's first.
    day: period,
    a: {
      admin: actorOf(admin), mgr: actorOf(mgr), ana: actorOf(ana), bo: actorOf(bo), lee: actorOf(lee),
    },
  };
}

async function hrActivity(organizationId: string) {
  return prisma.activity.findFirstOrThrow({ where: { organizationId, name: "HR activity" } });
}

describe("submit → approve → lock (BR-23–BR-28)", () => {
  it("runs the whole lifecycle and then refuses every write", async () => {
    const s = await seed("ta");
    const row = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    const saved = await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 90 });
    expect(saved.cell.minutes).toBe(90);
    expect(saved.totals.loggedMinutes).toBe(90);

    const week = await TimesheetService.getWeek(s.a.ana, s.period);
    const submitted = await TimesheetService.submit(s.a.ana, s.period, week.version);
    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.approvals.map((a) => [a.relation, a.approver.id])).toEqual([["REPORTING", s.mgr.id]]);
    expect(submitted.permissions.canEdit).toBe(false);

    // Submitted: read-only to the owner, from the grid and the issue page.
    await expect(
      TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 120, expectedVersion: saved.cell.version! }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      WorkLogService.create(s.a.ana, s.i1.id, { minutes: 30, workDate: s.day }),
    ).rejects.toBeInstanceOf(ConflictError);

    // The approver was told.
    expect(await prisma.notification.count({ where: { userId: s.mgr.id, type: "TIMESHEET_SUBMITTED" } })).toBe(1);

    const approved = await TimesheetApprovalService.approve(s.a.mgr, submitted.id!);
    expect(approved.status).toBe("APPROVED");
    expect(approved.locked).toBe(true);
    expect(await prisma.notification.count({ where: { userId: s.ana.id, type: "TIMESHEET_APPROVED" } })).toBe(1);

    // Locked: immutable from every path.
    await expect(TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i2.id })).rejects.toBeInstanceOf(ConflictError);
    await expect(WorkLogService.create(s.a.ana, s.i1.id, { minutes: 30, workDate: s.day })).rejects.toBeInstanceOf(ConflictError);
    const log = await prisma.workLog.findFirstOrThrow({ where: { userId: s.ana.id, deletedAt: null } });
    await expect(WorkLogService.delete(s.a.ana, log.id)).rejects.toBeInstanceOf(ConflictError);
    await expect(WorkLogService.delete(s.a.lee, log.id)).rejects.toBeInstanceOf(ConflictError);

    const history = await TimesheetApprovalService.history(s.a.ana, submitted.id!);
    expect(history.map((h) => [h.round, h.status])).toEqual([[1, "APPROVED"]]);
  });

  it("stores billable on each log, so a later default change never rewrites a week (BR-10)", async () => {
    const s = await seed("tb");
    await prisma.project.update({ where: { id: s.alpha.id }, data: { defaultBillable: true } });
    const row = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    expect(row.billable).toBe(true);
    await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 60 });
    await prisma.project.update({ where: { id: s.alpha.id }, data: { defaultBillable: false } });
    const week = await TimesheetService.getWeek(s.a.ana, s.period);
    expect(week.rows[0]!.billable).toBe(true);
    expect(week.totals.billableMinutes).toBe(60);
  });
});

describe("submit → return → resubmit, with project approvers (BR-26, Q3)", () => {
  it("returns only the project lead's lines and opens a new round", async () => {
    const s = await seed("tc", { relations: ["REPORTING", "PROJECT"] });
    const issueRow = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    const hr = await hrActivity(s.org.id);
    const hrRow = await TimesheetService.addRow(s.a.ana, s.period, { activityId: hr.id });
    await TimesheetService.saveCell(s.a.ana, s.period, issueRow.id!, s.day, { duration: 120 });
    await TimesheetService.saveCell(s.a.ana, s.period, hrRow.id!, s.day, { duration: 60 });

    const v = (await TimesheetService.getWeek(s.a.ana, s.period)).version;
    const sub = await TimesheetService.submit(s.a.ana, s.period, v);
    expect(sub.approvals.map((a) => [a.relation, a.approver.id])).toEqual([
      ["REPORTING", s.mgr.id],
      ["PROJECT", s.lee.id],
    ]);

    // The project lead sees only their project's line and cannot return the HR one.
    await expect(
      TimesheetApprovalService.returnLines(s.a.lee, sub.id!, { rows: [{ rowId: hrRow.id!, reason: "no" }] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const returned = await TimesheetApprovalService.returnLines(s.a.lee, sub.id!, {
      rows: [{ rowId: issueRow.id!, reason: "Split this across two days" }],
      comment: "Nearly there",
    });
    expect(returned.status).toBe("RETURNED");
    expect(returned.rows.map((r) => r.id)).toEqual([issueRow.id]);

    const mine = await TimesheetService.getWeek(s.a.ana, s.period);
    expect(mine.returnComment).toBe("Nearly there");
    const byId = new Map(mine.rows.map((r) => [r.id, r]));
    expect(byId.get(issueRow.id!)!.returnedReason).toBe("Split this across two days");
    expect(byId.get(issueRow.id!)!.editable).toBe(true);
    expect(byId.get(hrRow.id!)!.editable).toBe(false);

    // Only the returned line can change; adding rows waits for resubmission.
    const hrCell = byId.get(hrRow.id!)!.cells.find((c) => c.date === s.day)!;
    await expect(
      TimesheetService.saveCell(s.a.ana, s.period, hrRow.id!, s.day, { duration: 30, expectedVersion: hrCell.version! }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i2.id })).rejects.toBeInstanceOf(ConflictError);
    const cell = byId.get(issueRow.id!)!.cells.find((c) => c.date === s.day)!;
    await TimesheetService.saveCell(s.a.ana, s.period, issueRow.id!, s.day, { duration: 60, expectedVersion: cell.version! });

    const again = await TimesheetService.submit(s.a.ana, s.period, mine.version);
    expect(again.status).toBe("SUBMITTED");
    expect(again.rows.every((r) => r.returnedReason === null)).toBe(true);
    await TimesheetApprovalService.approve(s.a.lee, again.id!);
    const done = await TimesheetApprovalService.approve(s.a.mgr, again.id!);
    expect(done.status).toBe("APPROVED");

    const history = await TimesheetApprovalService.history(s.a.ana, again.id!);
    expect(history.map((h) => [h.round, h.relation, h.status])).toEqual([
      [1, "REPORTING", "SKIPPED"],
      [1, "PROJECT", "RETURNED"],
      [2, "REPORTING", "APPROVED"],
      [2, "PROJECT", "APPROVED"],
    ]);
  });

  it("never lets a project lead approve their own lines (Q5)", async () => {
    const s = await seed("td", { relations: ["REPORTING", "PROJECT"] });
    await prisma.teamMembership.create({ data: { teamId: s.team.id, userId: s.lee.id } });
    const row = await TimesheetService.addRow(s.a.lee, s.period, { issueId: s.i1.id });
    await TimesheetService.saveCell(s.a.lee, s.period, row.id!, s.day, { duration: 60 });
    const sub = await TimesheetService.submit(s.a.lee, s.period, 0);
    const project = sub.approvals.find((a) => a.relation === "PROJECT")!;
    expect(project.approver.id).toBe(s.mgr.id); // no other lead → reporting manager
    expect(project.fallbackFrom).toBe("PROJECT");
    expect(sub.approvals.some((a) => a.approver.id === s.lee.id)).toBe(false);
  });
});

describe("who can see and act (BR-31, BR-32, F-1)", () => {
  it("hides someone else's week behind a 404", async () => {
    const s = await seed("te");
    const row = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 60 });
    const sub = await TimesheetService.submit(s.a.ana, s.period, 0);

    await expect(TimesheetService.saveCell(s.a.bo, s.period, row.id!, s.day, { duration: 60 })).rejects.toBeInstanceOf(NotFoundError);
    await expect(TimesheetService.removeRow(s.a.bo, row.id!)).rejects.toBeInstanceOf(NotFoundError);
    await expect(TimesheetApprovalService.history(s.a.bo, sub.id!)).rejects.toBeInstanceOf(NotFoundError);
    await expect(TimesheetApprovalService.approve(s.a.bo, sub.id!)).rejects.toBeInstanceOf(NotFoundError);
    await expect(TimesheetApprovalService.approve(s.a.ana, sub.id!)).rejects.toBeInstanceOf(NotFoundError);

    const other = await seed("tf");
    await expect(TimesheetApprovalService.history(other.a.admin, sub.id!)).rejects.toBeInstanceOf(NotFoundError);
    await expect(TimesheetService.addRow(other.a.ana, other.period, { issueId: s.i1.id })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("auto-approves, with an audit entry, when nobody else could approve", async () => {
    const org = await prisma.organization.create({ data: { name: "solo", domain: "solo.example.com" } });
    const founder = await prisma.user.create({
      data: { organizationId: org.id, email: "f@solo.com", name: "Founder", orgRole: "ADMIN" },
    });
    const actor = actorOf(founder);
    const period = await TimesheetService.currentPeriodStart(actor);
    const hr = await hrActivity(org.id);
    const row = await TimesheetService.addRow(actor, period, { activityId: hr.id });
    await TimesheetService.saveCell(actor, period, row.id!, period, { duration: 60 });
    const week = await TimesheetService.submit(actor, period, 0);
    expect(week.status).toBe("APPROVED");
    expect(week.autoApproved).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "TIMESHEET_AUTO_APPROVED", entityId: week.id! } });
    expect(audit.afterData).toMatchObject({ reason: "no other approver available" });
  });
});

describe("org-admin stand-in (ADR-0059 §6.3, Q5)", () => {
  it("lets any org admin decide a slot an admin holds as a stand-in, and names who decided", async () => {
    const s = await seed("tz");
    const second = await prisma.user.create({
      data: { organizationId: s.org.id, email: "second-admin@x.com", name: "Second Admin", orgRole: "ADMIN" },
    });
    await prisma.teamMembership.delete({ where: { userId: s.ana.id } }); // no team manager → admins
    const row = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 60 });
    const sub = await TimesheetService.submit(s.a.ana, s.period, 0);
    const assigned = sub.approvals[0]!.approver.id;
    expect([s.admin.id, second.id]).toContain(assigned);
    expect(sub.approvals[0]!.fallbackFrom).toBe("REPORTING");

    // Both admins are told; whichever was not picked can still approve.
    for (const id of [s.admin.id, second.id]) {
      expect(await prisma.notification.count({ where: { userId: id, type: "TIMESHEET_SUBMITTED" } })).toBe(1);
    }
    const other = assigned === s.admin.id ? second : s.admin;
    const done = await TimesheetApprovalService.approve(actorOf(other), sub.id!);
    expect(done.status).toBe("APPROVED");
    const history = await TimesheetApprovalService.history(s.a.ana, sub.id!);
    expect(history[0]!.approver.id).toBe(other.id);

    // A non-admin who is not an approver still cannot.
    await expect(TimesheetApprovalService.approve(s.a.bo, sub.id!)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("unlock week (BR-34, Q13)", () => {
  it("needs an org admin and a reason, notifies the owner, and sends an edited week back for approval", async () => {
    const s = await seed("tg");
    const row = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 60 });
    const sub = await TimesheetService.submit(s.a.ana, s.period, 0);
    await TimesheetApprovalService.approve(s.a.mgr, sub.id!);

    await expect(TimesheetApprovalService.unlock(s.a.mgr, sub.id!, "fix")).rejects.toBeInstanceOf(ForbiddenError);
    const unlocked = await TimesheetApprovalService.unlock(s.a.admin, sub.id!, "Wrong project on Monday");
    expect(unlocked.locked).toBe(false);
    expect(unlocked.unlockedBy).toMatchObject({ name: "admin", reason: "Wrong project on Monday" });
    expect(await prisma.notification.count({ where: { userId: s.ana.id, type: "TIMESHEET_UNLOCKED" } })).toBe(1);
    await expect(TimesheetApprovalService.unlock(s.a.admin, sub.id!, "again")).rejects.toBeInstanceOf(ConflictError);

    // Still approved until the owner edits; the edit returns it to DRAFT.
    const before = await TimesheetService.getWeek(s.a.ana, s.period);
    expect(before.status).toBe("APPROVED");
    expect(before.permissions.canEdit).toBe(true);
    const cell = before.rows[0]!.cells.find((c) => c.date === s.day)!;
    await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 30, expectedVersion: cell.version! });
    expect((await TimesheetService.getWeek(s.a.ana, s.period)).status).toBe("DRAFT");
  });

  it("does not let an admin unlock their own week", async () => {
    const s = await seed("th");
    await prisma.teamMembership.create({ data: { teamId: s.team.id, userId: s.admin.id } });
    const hr = await hrActivity(s.org.id);
    const row = await TimesheetService.addRow(s.a.admin, s.period, { activityId: hr.id });
    await TimesheetService.saveCell(s.a.admin, s.period, row.id!, s.day, { duration: 60 });
    const sub = await TimesheetService.submit(s.a.admin, s.period, 0);
    await TimesheetApprovalService.approve(s.a.mgr, sub.id!);
    await expect(TimesheetApprovalService.unlock(s.a.admin, sub.id!, "mine")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("submit blocked (BR-24)", () => {
  it("lists every problem, each pointing at its cell or row", async () => {
    const s = await seed("ti");
    const hr = await hrActivity(s.org.id);
    await prisma.activity.update({ where: { id: hr.id }, data: { notesRequired: true, requiresProject: true } });
    const row = await TimesheetService.addRow(s.a.ana, s.period, { activityId: hr.id });
    await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 60 });
    const week = await TimesheetService.getWeek(s.a.ana, s.period);
    expect(week.problems.map((p) => p.code).sort()).toEqual(["NOTE_REQUIRED", "PROJECT_REQUIRED"]);

    const error = await TimesheetService.submit(s.a.ana, s.period, week.version).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ValidationError);
    const extra = (error as ValidationError).extra as { code: string; problems: { code: string; rowId: string; date: string | null }[] };
    expect(extra.code).toBe("SUBMIT_BLOCKED");
    expect(extra.problems).toContainEqual(expect.objectContaining({ code: "NOTE_REQUIRED", rowId: row.id, date: s.day }));
    expect(extra.problems).toContainEqual(expect.objectContaining({ code: "PROJECT_REQUIRED", rowId: row.id, date: null }));
  });

  it("blocks an empty week", async () => {
    const s = await seed("tj");
    await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    await expect(TimesheetService.submit(s.a.ana, s.period, 0)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("rows: copy, pin, duplicate, move (BR-17–BR-20)", () => {
  it("copies last week's rows without hours, and never twice", async () => {
    const s = await seed("tk");
    const previous = addDays(s.period, -7);
    const prevRow = await TimesheetService.addRow(s.a.ana, previous, { issueId: s.i1.id });
    await TimesheetService.saveCell(s.a.ana, previous, prevRow.id!, previous, { duration: 120 });
    const copied = await TimesheetService.copyPrevious(s.a.ana, s.period);
    expect(copied.rows.map((r) => [r.issue?.id, r.totalMinutes])).toEqual([[s.i1.id, 0]]);
    const again = await TimesheetService.copyPrevious(s.a.ana, s.period);
    expect(again.rows).toHaveLength(1);
  });

  it("brings a pinned row into a new week, and writing to it creates the week", async () => {
    const s = await seed("tl");
    const previous = addDays(s.period, -7);
    const row = await TimesheetService.addRow(s.a.ana, previous, { issueId: s.i1.id });
    await TimesheetService.pinRow(s.a.ana, row.id!);

    const fresh = await TimesheetService.getWeek(s.a.ana, s.period);
    expect(fresh.id).toBeNull();
    expect(fresh.rows).toHaveLength(1);
    expect(fresh.rows[0]!.id).toMatch(/^pinned:/);
    await TimesheetService.saveCell(s.a.ana, s.period, fresh.rows[0]!.id!, s.day, { duration: 30 });
    const created = await TimesheetService.getWeek(s.a.ana, s.period);
    expect(created.id).not.toBeNull();
    expect(created.rows[0]!.pinned).toBe(true);
    expect(created.totals.loggedMinutes).toBe(30);

    // Unpinning keeps this week's row.
    await TimesheetService.unpinRow(s.a.ana, created.rows[0]!.id!);
    const after = await TimesheetService.getWeek(s.a.ana, s.period);
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0]!.pinned).toBe(false);
    expect(await TimesheetService.listPinned(s.a.ana)).toEqual([]);
  });

  it("duplicates without hours and keeps the order across moves", async () => {
    const s = await seed("tm");
    const first = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    const second = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i2.id });
    await TimesheetService.saveCell(s.a.ana, s.period, first.id!, s.day, { duration: 60 });
    const copy = await TimesheetService.duplicateRow(s.a.ana, first.id!);
    expect(copy.totalMinutes).toBe(0);
    let order = (await TimesheetService.getWeek(s.a.ana, s.period)).rows.map((r) => r.id);
    expect(order).toEqual([first.id, copy.id, second.id]);
    await TimesheetService.moveRow(s.a.ana, second.id!, "up");
    await TimesheetService.moveRow(s.a.ana, first.id!, "up"); // already first: no-op
    order = (await TimesheetService.getWeek(s.a.ana, s.period)).rows.map((r) => r.id);
    expect(order).toEqual([first.id, second.id, copy.id]);
  });
});

describe("module 19 under timesheets (ADR-0059 §6.2, Q8, Q9)", () => {
  it("lets a LEAD remove someone's time only from a DRAFT week, and tells the author", async () => {
    const s = await seed("tn");
    const log = await WorkLogService.create(s.a.ana, s.i1.id, { minutes: 45, workDate: s.day });
    await WorkLogService.delete(s.a.lee, log.id);
    const n = await prisma.notification.findFirstOrThrow({ where: { userId: s.ana.id, type: "WORKLOG_REMOVED" } });
    expect(n.message).toContain("lee removed 45m");

    const log2 = await WorkLogService.create(s.a.ana, s.i1.id, { minutes: 30, workDate: s.day });
    await TimesheetService.submit(s.a.ana, s.period, (await TimesheetService.getWeek(s.a.ana, s.period)).version);
    await expect(WorkLogService.delete(s.a.lee, log2.id)).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to inline-edit a cell holding several logs, rather than merge them", async () => {
    const s = await seed("to");
    await WorkLogService.create(s.a.ana, s.i1.id, { minutes: 30, workDate: s.day });
    await WorkLogService.create(s.a.ana, s.i1.id, { minutes: 45, workDate: s.day });
    const week = await TimesheetService.getWeek(s.a.ana, s.period);
    expect(week.rows).toHaveLength(1); // both landed on the issue's one row
    const cell = week.rows[0]!.cells.find((c) => c.date === s.day)!;
    expect(cell).toMatchObject({ minutes: 75, logCount: 2, logId: null });
    const error = await TimesheetService.saveCell(s.a.ana, s.period, week.rows[0]!.id!, s.day, { duration: 60 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).extra).toEqual({ code: "MULTIPLE_LOGS" });
  });

  it("refuses future days", async () => {
    const s = await seed("tp");
    const row = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    const tomorrow = addDays(todayIn("UTC"), 1);
    if (tomorrow <= addDays(s.period, 6)) {
      await expect(TimesheetService.saveCell(s.a.ana, s.period, row.id!, tomorrow, { duration: 60 })).rejects.toBeInstanceOf(ValidationError);
    }
    await expect(TimesheetService.saveCell(s.a.ana, s.period, row.id!, addDays(s.period, 7), { duration: 60 })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("acceptance criteria not covered above (37 §6)", () => {
  it("rejects a stale write to the same cell from a second tab with 409", async () => {
    const s = await seed("tx");
    const row = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    const first = await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 60 });
    const staleVersion = first.cell.version!;
    await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 90, expectedVersion: staleVersion });
    await expect(
      TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 30, expectedVersion: staleVersion }),
    ).rejects.toBeInstanceOf(ConflictError);
    const week = await TimesheetService.getWeek(s.a.ana, s.period);
    expect(week.rows[0]!.cells.find((c) => c.date === s.day)!.minutes).toBe(90);
  });

  it("flags an overtime day but still lets the week submit (BR-15)", async () => {
    const s = await seed("ty");
    const row = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 600 });
    const week = await TimesheetService.getWeek(s.a.ana, s.period);
    expect(week.days.find((d) => d.date === s.day)!.overtime).toBe(true);
    expect(week.problems).toEqual([]);
    expect((await TimesheetService.submit(s.a.ana, s.period, week.version)).status).toBe("SUBMITTED");
  });

  it("routes an activity line tagged to a project to that project's lead (Q3)", async () => {
    const s = await seed("tw", { relations: ["REPORTING", "PROJECT"] });
    const hr = await hrActivity(s.org.id);
    const row = await TimesheetService.addRow(s.a.ana, s.period, { activityId: hr.id, projectId: s.alpha.id });
    await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 60 });
    const sub = await TimesheetService.submit(s.a.ana, s.period, 0);
    expect(sub.approvals.map((a) => [a.relation, a.approver.id])).toContainEqual(["PROJECT", s.lee.id]);
    // …and the lead may return that tagged activity line.
    const back = await TimesheetApprovalService.returnLines(s.a.lee, sub.id!, { rows: [{ rowId: row.id!, reason: "Which task?" }] });
    expect(back.status).toBe("RETURNED");
  });
});

describe("database invariants (ADR-0059 §3.2)", () => {
  it("rejects a log with both an issue and an activity, or with neither", async () => {
    const s = await seed("tq");
    const row = await TimesheetService.addRow(s.a.ana, s.period, { issueId: s.i1.id });
    await TimesheetService.saveCell(s.a.ana, s.period, row.id!, s.day, { duration: 60 });
    const log = await prisma.workLog.findFirstOrThrow({ where: { timesheetRowId: row.id! } });
    const hr = await hrActivity(s.org.id);
    await expect(prisma.workLog.update({ where: { id: log.id }, data: { activityId: hr.id } })).rejects.toThrow(/work_logs_issue_xor_activity/);
    await expect(prisma.workLog.update({ where: { id: log.id }, data: { issueId: null } })).rejects.toThrow(/work_logs_issue_xor_activity/);
    await expect(prisma.workLog.update({ where: { id: log.id }, data: { projectId: s.alpha.id } })).rejects.toThrow(/tags_only_on_activities/);
  });

  it("rejects a malformed period start with a 422", async () => {
    const s = await seed("tr");
    await expect(TimesheetService.getWeek(s.a.ana, addDays(s.period, 1))).rejects.toBeInstanceOf(ValidationError);
  });
});
