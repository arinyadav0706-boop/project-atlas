import {
  TimesheetRepository,
  type TimesheetRecord,
} from "@/features/timesheets/repositories/timesheet.repository";
import { buildWeek, isLocked, periodFor } from "@/features/timesheets/services/timesheet-week";
import { ensureOrgDefaults } from "@/features/timesheets/services/timesheet.service";
import { coveredProjectIds } from "@/features/timesheets/lib/approvers";
import { toIsoDate, todayIn } from "@/features/timesheets/lib/period";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { NotificationService } from "@/features/notifications/services/notification.service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { TimesheetApprovalDto, TimesheetWeekDto } from "@/features/timesheets/types/timesheet.types";
import type { ReturnInput } from "@/features/timesheets/validation/timesheet.schemas";

// The approver's and the admin's side of the lifecycle (ADR-0059 §4, §6.3,
// §6.5; 37_timesheets BR-26–BR-34). The approvals inbox screen comes later
// (TS-9); this is its API.

function periodLabel(sheet: TimesheetRecord): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(sheet.periodStart)} – ${fmt(sheet.periodEnd)}`;
}

async function loadSheet(actor: Actor, timesheetId: string): Promise<TimesheetRecord> {
  const sheet = await TimesheetRepository.findSheetById(timesheetId);
  // F-1 and BR-32: another org's, or simply not yours to see, is a 404.
  if (!sheet || sheet.organizationId !== actor.organizationId) throw new NotFoundError("Timesheet not found.");
  return sheet;
}

async function context(sheet: TimesheetRecord) {
  await ensureOrgDefaults(sheet.organizationId);
  const [settings, policies, policy] = await Promise.all([
    TimesheetRepository.orgSettings(sheet.organizationId),
    TimesheetRepository.policies(sheet.organizationId),
    TimesheetRepository.policyById(sheet.policyId),
  ]);
  const period = periodFor(policies, toIsoDate(sheet.periodStart));
  if (!settings || !period || !policy) throw new NotFoundError("Timesheet not found.");
  // The sheet's own stored period wins over today's policy (BR-2).
  return {
    settings,
    policy,
    period: { policy, start: toIsoDate(sheet.periodStart), end: toIsoDate(sheet.periodEnd) },
  };
}

// The current round's slots belonging to this approver that can act now:
// all of them in PARALLEL mode; in SEQUENTIAL mode only while every earlier
// slot of the round is decided.
async function actionableSlots(sheet: TimesheetRecord, approverId: string, mode: "PARALLEL" | "SEQUENTIAL") {
  const round = await TimesheetRepository.approvals(sheet.id, sheet.round);
  const pending = round.filter((a) => a.status === "PENDING");
  const mine = pending.filter((a) => a.approverId === approverId);
  if (mode === "SEQUENTIAL") {
    const firstPending = Math.min(...pending.map((a) => a.sequence));
    return { round, mine: mine.filter((a) => a.sequence === firstPending) };
  }
  return { round, mine };
}

async function weekForViewer(actor: Actor, sheet: TimesheetRecord): Promise<TimesheetWeekDto> {
  const fresh = (await TimesheetRepository.findSheetById(sheet.id)) ?? sheet;
  const { settings, period } = await context(fresh);
  const isOwner = fresh.userId === actor.userId;
  let visibleProjectIds: Set<string> | null = null;
  if (!isOwner && actor.orgRole !== "ADMIN") {
    // A PROJECT-only approver sees their project's lines only (BR-31).
    const all = await TimesheetRepository.approvals(fresh.id);
    const cover = coveredProjectIds(all, actor.userId);
    if (!cover.wholeWeek) visibleProjectIds = cover.projectIds;
  }
  return buildWeek({
    organizationId: fresh.organizationId,
    viewerId: actor.userId,
    ownerId: fresh.userId,
    isAdmin: actor.orgRole === "ADMIN",
    sheet: fresh,
    period,
    settings,
    visibleProjectIds,
  });
}

export const TimesheetApprovalService = {
  // GET /timesheets/{id}/history — the owner, anyone ever asked to approve it,
  // and org admins (who may need to unlock it). Everyone else: 404.
  async history(actor: Actor, timesheetId: string): Promise<TimesheetApprovalDto[]> {
    const sheet = await loadSheet(actor, timesheetId);
    const allowed =
      sheet.userId === actor.userId ||
      actor.orgRole === "ADMIN" ||
      (await TimesheetRepository.isApproverOf(sheet.id, actor.userId)) > 0;
    if (!allowed) throw new NotFoundError("Timesheet not found.");
    const all = await TimesheetRepository.approvals(sheet.id);
    const ids = [...new Set(all.flatMap((a) => (a.projectId ? [a.projectId] : [])))];
    const names = new Map((ids.length ? await TimesheetRepository.projectNames(ids) : []).map((p) => [p.id, p.name]));
    return all.map((a) => ({
      round: a.round,
      relation: a.relation,
      project: a.projectId ? { id: a.projectId, name: names.get(a.projectId) ?? "" } : null,
      approver: a.approver,
      status: a.status,
      fallbackFrom: a.fallbackFrom,
      decidedAt: a.decidedAt?.toISOString() ?? null,
      comment: a.comment,
    }));
  },

  // BR-30a: approved when every slot of the current round is approved.
  async approve(actor: Actor, timesheetId: string, comment?: string): Promise<TimesheetWeekDto> {
    const sheet = await loadSheet(actor, timesheetId);
    if (sheet.userId === actor.userId) throw new NotFoundError("Timesheet not found.");
    const { policy } = await context(sheet);
    if (sheet.status !== "SUBMITTED") throw new ConflictError("This timesheet is not waiting for approval.");
    const { round, mine } = await actionableSlots(sheet, actor.userId, policy.approvalMode);
    if (mine.length === 0) {
      if (round.some((a) => a.approverId === actor.userId)) {
        throw new ConflictError("You have already decided, or it is not your turn yet.");
      }
      throw new NotFoundError("Timesheet not found.");
    }
    await TimesheetRepository.decide(mine.map((a) => a.id), "APPROVED", comment?.trim() || null);

    const after = await TimesheetRepository.approvals(sheet.id, sheet.round);
    const done = after.every((a) => a.status === "APPROVED" || a.status === "SKIPPED");
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "TIMESHEET_APPROVAL_DECIDED",
      entityType: "Timesheet",
      entityId: sheet.id,
      afterData: { round: sheet.round, decision: "APPROVED", slots: mine.map((a) => a.relation) },
    });
    if (done) {
      const now = new Date();
      const ok = await TimesheetRepository.updateSheetIfVersion(sheet.id, sheet.version, {
        status: "APPROVED",
        approvedAt: now,
        lockedAt: policy.autoLockOnApproval ? now : null,
        updatedBy: actor.userId,
      });
      if (!ok) throw new ConflictError("This timesheet changed since you opened it — refresh and try again.");
      await AuditLogService.record({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "TIMESHEET_APPROVED",
        entityType: "Timesheet",
        entityId: sheet.id,
        afterData: { round: sheet.round, locked: policy.autoLockOnApproval },
      });
      await NotificationService.timesheetApproved(actor, {
        timesheetId: sheet.id,
        ownerId: sheet.userId,
        periodLabel: periodLabel(sheet),
      });
    }
    return weekForViewer(actor, sheet);
  },

  // BR-26: return specific lines with a reason. Ends the round: the other
  // pending slots are skipped, and resubmitting opens a new round.
  async returnLines(actor: Actor, timesheetId: string, input: ReturnInput): Promise<TimesheetWeekDto> {
    const sheet = await loadSheet(actor, timesheetId);
    if (sheet.userId === actor.userId) throw new NotFoundError("Timesheet not found.");
    const { policy } = await context(sheet);
    if (sheet.status !== "SUBMITTED") throw new ConflictError("This timesheet is not waiting for approval.");
    const { round, mine } = await actionableSlots(sheet, actor.userId, policy.approvalMode);
    if (mine.length === 0) {
      if (round.some((a) => a.approverId === actor.userId)) {
        throw new ConflictError("You have already decided, or it is not your turn yet.");
      }
      throw new NotFoundError("Timesheet not found.");
    }

    const cover = coveredProjectIds(round, actor.userId);
    const rows = await TimesheetRepository.rows(sheet.id);
    for (const r of input.rows) {
      const row = rows.find((x) => x.id === r.rowId);
      if (!row) throw new ValidationError("One of those lines is not on this timesheet.");
      const pid = row.issue ? row.issue.project.id : row.projectId;
      if (!cover.wholeWeek && (!pid || !cover.projectIds.has(pid))) {
        throw new ForbiddenError("You can only return lines of your own project.");
      }
    }

    await TimesheetRepository.markRowsReturned(input.rows, actor.userId);
    await TimesheetRepository.decide(mine.map((a) => a.id), "RETURNED", input.comment?.trim() || null);
    await TimesheetRepository.skipPending(sheet.id, sheet.round);
    const ok = await TimesheetRepository.updateSheetIfVersion(sheet.id, sheet.version, {
      status: "RETURNED",
      updatedBy: actor.userId,
    });
    if (!ok) throw new ConflictError("This timesheet changed since you opened it — refresh and try again.");

    for (const r of input.rows) {
      await AuditLogService.record({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: "TIMESHEET_ROW_RETURNED",
        entityType: "Timesheet",
        entityId: sheet.id,
        afterData: { round: sheet.round, rowId: r.rowId, reason: r.reason },
      });
    }
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "TIMESHEET_RETURNED",
      entityType: "Timesheet",
      entityId: sheet.id,
      afterData: { round: sheet.round, lines: input.rows.length, comment: input.comment ?? null },
    });
    const approver = await TimesheetRepository.userName(actor.userId);
    await NotificationService.timesheetReturned(actor, {
      timesheetId: sheet.id,
      ownerId: sheet.userId,
      approverName: approver?.name ?? "An approver",
      periodLabel: periodLabel(sheet),
      lineCount: input.rows.length,
    });
    return weekForViewer(actor, sheet);
  },

  // BR-34 / ADR-0059 §6.5: an org admin unlocks someone else's locked week.
  async unlock(actor: Actor, timesheetId: string, reason: string): Promise<TimesheetWeekDto> {
    if (actor.orgRole !== "ADMIN") throw new ForbiddenError("Only an organization admin can unlock a week.");
    const sheet = await loadSheet(actor, timesheetId);
    if (sheet.userId === actor.userId) throw new ForbiddenError("You can't unlock your own week.");
    const { policy } = await context(sheet);
    if (!isLocked(sheet, policy, todayIn(policy.timezone))) throw new ConflictError("This week is not locked.");
    if (!sheet.lockedAt) {
      // Locked by an age rule (lockAfterDays), which an unlock cannot undo
      // without a policy change — say so rather than pretend.
      throw new ConflictError("This week is locked by your organization's lock-after rule, not by a person.");
    }
    const ok = await TimesheetRepository.updateSheetIfVersion(sheet.id, sheet.version, {
      lockedAt: null,
      lockedById: null,
      updatedBy: actor.userId,
    });
    if (!ok) throw new ConflictError("This timesheet changed since you opened it — refresh and try again.");
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "TIMESHEET_UNLOCKED",
      entityType: "Timesheet",
      entityId: sheet.id,
      beforeData: { lockedAt: sheet.lockedAt.toISOString(), status: sheet.status },
      afterData: { reason },
    });
    const admin = await TimesheetRepository.userName(actor.userId);
    await NotificationService.timesheetUnlocked(actor, {
      timesheetId: sheet.id,
      ownerId: sheet.userId,
      adminName: admin?.name ?? "An admin",
      periodLabel: periodLabel(sheet),
      reason,
    });
    return weekForViewer(actor, sheet);
  },
};
