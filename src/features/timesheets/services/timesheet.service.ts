import {
  TimesheetRepository,
  isUniqueViolation,
  type PolicyRecord,
  type TimesheetRecord,
  type TimesheetRowRecord,
  type WorkItem,
} from "@/features/timesheets/repositories/timesheet.repository";
import { ActivityRepository, type CatalogueCategory } from "@/features/timesheets/repositories/activity.repository";
import {
  billableForRow,
  buildWeek,
  editModeOf,
  periodFor,
  rowEditable,
  type EditMode,
  type OrgSettings,
  type Period,
} from "@/features/timesheets/services/timesheet-week";
import { addDays, fromIsoDate, toIsoDate, todayIn, deadlineFor, type IsoDate } from "@/features/timesheets/lib/period";
import { planApprovers } from "@/features/timesheets/lib/approvers";
import { resolveBillable } from "@/features/timesheets/lib/rules";
import { ProjectService } from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { NotificationService } from "@/features/notifications/services/notification.service";
import { FavoriteService } from "@/features/home/services/favorite.service";
import { canWriteContent, elevate } from "@/features/authorization/permission";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type {
  ActivityPickerDto,
  PinnedTimesheetRowDto,
  TimesheetCellSaveResultDto,
  TimesheetIssueOptionDto,
  TimesheetRowDto,
  TimesheetWeekDto,
} from "@/features/timesheets/types/timesheet.types";
import type { RowInput, SaveCellInput, UpdateRowInput } from "@/features/timesheets/validation/timesheet.schemas";

// Business rules: docs/02_Modules/37_timesheets.md (ADR-0059). The owner's
// side of the lifecycle. RBAC, state rules, OCC and audit live here; Prisma
// only in the repositories.

// ADR-0059 Q7: until an admin sets the organization's timezone (TS-15), its
// first policy uses UTC. Changing it is a new policy row, effective from the
// next period.
const DEFAULT_TIMEZONE = "UTC";

// ADR-0059 Q14: every organization starts with this list, which its admins
// can edit (TS-5). Kept generic on purpose — it is a starting point.
const DEFAULT_CATALOGUE: CatalogueCategory[] = [
  {
    name: "Meetings",
    activities: [
      { name: "Internal meeting" },
      { name: "Daily stand-up" },
      { name: "Planning & grooming" },
      { name: "Retrospective" },
      { name: "1:1" },
    ],
  },
  {
    name: "Client work",
    activities: [
      { name: "Client meeting", billable: true, requiresClient: true },
      { name: "Pre-sales & proposals", requiresClient: true },
      { name: "Client support", billable: true, requiresClient: true },
    ],
  },
  {
    name: "Internal",
    activities: [
      { name: "Preparation" },
      { name: "Documentation & drafting" },
      { name: "Research" },
      { name: "Support & on-call" },
    ],
  },
  {
    name: "People & HR",
    activities: [
      { name: "HR activity" },
      { name: "Hiring & interviews" },
      { name: "Training & learning" },
    ],
  },
];

const ensuredOrgs = new Set<string>();

// Organizations get their first policy and activity list on first use, not at
// creation, so no organization-creation path has to remember them (37 §3).
export async function ensureOrgDefaults(organizationId: string): Promise<void> {
  if (ensuredOrgs.has(organizationId)) return;
  await TimesheetRepository.ensureDefaultPolicy(organizationId, DEFAULT_TIMEZONE);
  if ((await ActivityRepository.hasCatalogue(organizationId)) === 0) {
    await ActivityRepository.seedCatalogue(organizationId, DEFAULT_CATALOGUE);
  }
  ensuredOrgs.add(organizationId);
}

interface Context {
  settings: OrgSettings;
  policies: PolicyRecord[];
}

async function loadContext(organizationId: string): Promise<Context> {
  await ensureOrgDefaults(organizationId);
  const [settings, policies] = await Promise.all([
    TimesheetRepository.orgSettings(organizationId),
    TimesheetRepository.policies(organizationId),
  ]);
  if (!settings) throw new NotFoundError("Organization not found.");
  return { settings, policies };
}

function requirePeriod(ctx: Context, date: IsoDate): Period {
  const period = periodFor(ctx.policies, date);
  if (!period) throw new ValidationError("No timesheet policy covers this date.");
  return period;
}

// The caller's own week, addressed by its first day (37 §4). A date that is
// not a period start is a 422, never silently moved to one.
function requirePeriodStart(ctx: Context, periodStart: IsoDate): Period {
  const period = requirePeriod(ctx, periodStart);
  if (period.start !== periodStart) {
    throw new ValidationError(`${periodStart} is not the first day of a timesheet period (${period.start} is).`);
  }
  return period;
}

function periodLabel(start: IsoDate, end: IsoDate): string {
  const fmt = (d: IsoDate) =>
    fromIsoDate(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

async function audit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  afterData: Record<string, unknown>,
  beforeData?: Record<string, unknown>,
): Promise<void> {
  await AuditLogService.record({
    organizationId: actor.organizationId,
    actorId: actor.userId,
    action,
    entityType,
    entityId,
    afterData,
    ...(beforeData ? { beforeData } : {}),
  });
}

// Find the owner's week, creating it (with their pinned rows) on first write.
async function ensureSheet(actor: Actor, period: Period): Promise<TimesheetRecord> {
  const start = fromIsoDate(period.start);
  const existing = await TimesheetRepository.findSheet(actor.userId, start);
  if (existing) return existing;
  try {
    const sheet = await TimesheetRepository.createSheetWithPinnedRows({
      organizationId: actor.organizationId,
      userId: actor.userId,
      periodStart: start,
      periodEnd: fromIsoDate(period.end),
      policyId: period.policy.id,
    });
    await audit(actor, "TIMESHEET_CREATED", "Timesheet", sheet.id, { periodStart: period.start });
    return sheet;
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await TimesheetRepository.findSheet(actor.userId, start);
    if (!raced) throw error;
    return raced;
  }
}

async function policyOf(sheet: TimesheetRecord, fallback: PolicyRecord): Promise<PolicyRecord> {
  return (await TimesheetRepository.policyById(sheet.policyId)) ?? fallback;
}

// The week's write gate. REOPENED (an admin unlocked an approved week) turns
// back into DRAFT on the first edit, so it must be approved again (BR-34).
async function writableMode(actor: Actor, sheet: TimesheetRecord, policy: PolicyRecord): Promise<EditMode> {
  const mode = await editModeOf(sheet, policy, todayIn(policy.timezone));
  if (mode === "READONLY") {
    throw new ConflictError(
      sheet.lockedAt ? "This week is locked." : "This week has been submitted and can't be changed.",
    );
  }
  if (mode === "REOPENED") {
    const ok = await TimesheetRepository.updateSheetIfVersion(sheet.id, sheet.version, {
      status: "DRAFT",
      approvedAt: null,
      autoApproved: false,
      updatedBy: actor.userId,
    });
    if (!ok) throw new ConflictError("This week changed since you opened it — refresh and try again.");
    await audit(actor, "TIMESHEET_REOPENED", "Timesheet", sheet.id, { reason: "edited after unlock" });
    return "EDIT";
  }
  return mode;
}

function requireWholeWeekEdit(mode: EditMode): void {
  if (mode === "RETURNED_ONLY") {
    throw new ConflictError("Only the returned lines can be changed until you resubmit.");
  }
}

async function ownRow(actor: Actor, rowId: string): Promise<{ row: TimesheetRowRecord; sheet: TimesheetRecord }> {
  const row = await TimesheetRepository.findRow(rowId);
  if (!row) throw new NotFoundError("Row not found.");
  const sheet = await TimesheetRepository.findSheetById(row.timesheetId);
  // BR-31/BR-32: only the owner writes; anyone else gets 404, never 403.
  if (!sheet || sheet.userId !== actor.userId || sheet.organizationId !== actor.organizationId) {
    throw new NotFoundError("Row not found.");
  }
  return { row, sheet };
}

// Validates a work item for this actor: the issue is one they can log time on
// (module 19 BR-1); the activity is active and visible to their team; tags
// are in their organization (F-1).
async function validateWorkItem(actor: Actor, input: RowInput): Promise<WorkItem> {
  if (input.issueId) {
    const issue = await TimesheetRepository.issueForRow(input.issueId);
    if (!issue || issue.project.organizationId !== actor.organizationId || issue.project.deletedAt) {
      throw new NotFoundError("Issue not found.");
    }
    if (issue.project.status === "ARCHIVED") throw new ConflictError("Archived projects are read-only.");
    const role = elevate(actor, await ProjectService.getMemberRole(issue.projectId, actor.userId));
    if (!canWriteContent(role)) throw new ForbiddenError("You need to be a project member to log time.");
    return { issueId: issue.id, activityId: null, projectId: null, clientId: null };
  }
  const activity = input.activityId ? await ActivityRepository.findById(input.activityId) : null;
  if (!activity || activity.organizationId !== actor.organizationId || activity.archivedAt) {
    throw new NotFoundError("Activity not found.");
  }
  if (!activity.visibleToAllTeams) {
    const teamId = await TimesheetRepository.teamIdOf(actor.userId);
    if (!teamId || !activity.teams.some((t) => t.teamId === teamId)) throw new NotFoundError("Activity not found.");
  }
  if (input.projectId && !(await TimesheetRepository.projectInOrg(input.projectId, actor.organizationId))) {
    throw new NotFoundError("Project not found.");
  }
  if (input.clientId && !(await TimesheetRepository.clientInOrg(input.clientId, actor.organizationId))) {
    throw new NotFoundError("Client not found.");
  }
  return {
    issueId: null,
    activityId: activity.id,
    projectId: input.projectId ?? null,
    clientId: input.clientId ?? null,
  };
}

async function billableFor(item: WorkItem, override: boolean | null, policy: PolicyRecord): Promise<boolean> {
  const d = await TimesheetRepository.billableDefaults(item);
  return resolveBillable({ override, ...d, policyDefault: policy.defaultBillable });
}

function workItemOf(row: { issueId: string | null; activityId: string | null; projectId: string | null; clientId: string | null }): WorkItem {
  return { issueId: row.issueId, activityId: row.activityId, projectId: row.projectId, clientId: row.clientId };
}

function sameItem(a: WorkItem, b: WorkItem): boolean {
  return a.issueId === b.issueId && a.activityId === b.activityId && a.projectId === b.projectId && a.clientId === b.clientId;
}

async function weekFor(actor: Actor, ctx: Context, period: Period): Promise<TimesheetWeekDto> {
  const sheet = await TimesheetRepository.findSheet(actor.userId, fromIsoDate(period.start));
  return buildWeek({
    organizationId: actor.organizationId,
    viewerId: actor.userId,
    ownerId: actor.userId,
    isAdmin: actor.orgRole === "ADMIN",
    sheet,
    period,
    settings: ctx.settings,
  });
}

async function rowDto(actor: Actor, ctx: Context, sheet: TimesheetRecord, rowId: string): Promise<TimesheetRowDto> {
  const period = requirePeriod(ctx, toIsoDate(sheet.periodStart));
  const week = await weekFor(actor, ctx, period);
  const row = week.rows.find((r) => r.id === rowId);
  if (!row) throw new NotFoundError("Row not found.");
  return row;
}

export const TimesheetService = {
  // GET /timesheets/me/weeks/{periodStart}. Reads never create anything.
  async getWeek(actor: Actor, periodStart: IsoDate): Promise<TimesheetWeekDto> {
    const ctx = await loadContext(actor.organizationId);
    return weekFor(actor, ctx, requirePeriodStart(ctx, periodStart));
  },

  // The current period's first day, for the page's default route.
  async currentPeriodStart(actor: Actor): Promise<IsoDate> {
    const ctx = await loadContext(actor.organizationId);
    const latest = ctx.policies.at(-1)!;
    return requirePeriod(ctx, todayIn(latest.timezone)).start;
  },

  // Resolves a notification link (?timesheet=<id>) to the owner's week.
  async periodStartOf(actor: Actor, timesheetId: string): Promise<IsoDate> {
    const sheet = await TimesheetRepository.findSheetById(timesheetId);
    if (!sheet || sheet.userId !== actor.userId) throw new NotFoundError("Timesheet not found.");
    return toIsoDate(sheet.periodStart);
  },

  async addRow(actor: Actor, periodStart: IsoDate, input: RowInput): Promise<TimesheetRowDto> {
    const ctx = await loadContext(actor.organizationId);
    const period = requirePeriodStart(ctx, periodStart);
    const item = await validateWorkItem(actor, input);
    const sheet = await ensureSheet(actor, period);
    const policy = await policyOf(sheet, period.policy);
    requireWholeWeekEdit(await writableMode(actor, sheet, policy));
    const row = await TimesheetRepository.appendRow({ ...item, timesheetId: sheet.id, actorId: actor.userId });
    await audit(actor, "TIMESHEET_ROW_ADDED", "Timesheet", sheet.id, { rowId: row.id, ...item });
    return rowDto(actor, ctx, sheet, row.id);
  },

  // PUT …/rows/{rowId}/cells/{date}: one autosaved cell (BR-5–BR-8). rowId may
  // be `pinned:<id>` for a pinned row in a week that does not exist yet.
  async saveCell(
    actor: Actor,
    periodStart: IsoDate,
    rowRef: string,
    date: IsoDate,
    input: SaveCellInput,
  ): Promise<TimesheetCellSaveResultDto> {
    const ctx = await loadContext(actor.organizationId);
    const period = requirePeriodStart(ctx, periodStart);
    if (date < period.start || date > period.end) throw new ValidationError("That day is outside this week.");
    if (date > todayIn(period.policy.timezone)) throw new ValidationError("You can't log time on a future day.");

    const sheet = await ensureSheet(actor, period);
    let rowId = rowRef;
    if (rowRef.startsWith("pinned:")) {
      const pinnedId = rowRef.slice("pinned:".length);
      const rows = await TimesheetRepository.rows(sheet.id);
      const match = rows.find((r) => r.pinnedRowId === pinnedId);
      if (!match) throw new NotFoundError("Row not found.");
      rowId = match.id;
    }
    const { row } = await ownRow(actor, rowId);
    if (row.timesheetId !== sheet.id) throw new NotFoundError("Row not found.");

    const policy = await policyOf(sheet, period.policy);
    const mode = await writableMode(actor, sheet, policy);
    if (!rowEditable(mode, row)) throw new ConflictError("Only the returned lines can be changed until you resubmit.");

    const workDate = fromIsoDate(date);
    const existing = await TimesheetRepository.cellLogs(row.id, workDate);
    if (existing.length > 1) {
      throw new ConflictError("This cell has several entries — edit them one by one.", { code: "MULTIPLE_LOGS" });
    }
    const current = existing[0] ?? null;
    const note = input.note?.trim() ? input.note.trim() : null;

    if (input.duration === 0) {
      if (current) {
        if (input.expectedVersion === undefined) throw new ValidationError("expectedVersion is required.");
        const ok = await TimesheetRepository.softDeleteLogIfVersion(current.id, input.expectedVersion, actor.userId);
        if (!ok) throw new ConflictError("This cell changed since you opened it — refresh and try again.");
        await audit(actor, "WORKLOG_DELETED", "WorkLog", current.id, { timesheetId: sheet.id, date });
      }
    } else if (current) {
      if (input.expectedVersion === undefined) throw new ValidationError("expectedVersion is required.");
      const updated = await TimesheetRepository.updateLogIfVersion(
        current.id,
        input.expectedVersion,
        { minutes: input.duration, note: input.note === undefined ? current.note : note },
        actor.userId,
      );
      if (!updated) throw new ConflictError("This cell changed since you opened it — refresh and try again.");
      await audit(actor, "WORKLOG_UPDATED", "WorkLog", current.id, { timesheetId: sheet.id, date, minutes: input.duration });
    } else {
      const billable = billableForRow(row, policy);
      const created = await TimesheetRepository.createLog({
        ...workItemOf(row),
        organizationId: actor.organizationId,
        userId: actor.userId,
        timesheetId: sheet.id,
        timesheetRowId: row.id,
        workDate,
        minutes: input.duration,
        note,
        billable,
        billableOverridden: row.billableOverride !== null,
      });
      await audit(actor, "WORKLOG_CREATED", "WorkLog", created.id, { timesheetId: sheet.id, date, minutes: input.duration });
    }

    const week = await weekFor(actor, ctx, period);
    const rowAfter = week.rows.find((r) => r.id === row.id)!;
    return {
      cell: rowAfter.cells.find((c) => c.date === date)!,
      rowTotalMinutes: rowAfter.totalMinutes,
      day: week.days.find((d) => d.date === date)!,
      totals: week.totals,
      timesheetId: sheet.id,
      timesheetVersion: week.version,
    };
  },

  async updateRow(actor: Actor, rowId: string, input: UpdateRowInput): Promise<TimesheetRowDto> {
    const ctx = await loadContext(actor.organizationId);
    const { row, sheet } = await ownRow(actor, rowId);
    const policy = await policyOf(sheet, requirePeriod(ctx, toIsoDate(sheet.periodStart)).policy);
    const mode = await writableMode(actor, sheet, policy);
    if (!rowEditable(mode, row)) throw new ConflictError("Only the returned lines can be changed until you resubmit.");

    if (input.billableOverride !== undefined && input.billableOverride !== row.billableOverride) {
      if (!policy.employeesMayOverrideBillable) {
        throw new ForbiddenError("Your organization doesn't allow changing billable on timesheet lines.");
      }
    }
    // The work item changes only when a new issue/activity is given; tags may
    // change on their own for an activity row.
    let item = workItemOf(row);
    if (input.issueId) item = await validateWorkItem(actor, { issueId: input.issueId });
    else if (input.activityId || (row.activityId && (input.projectId !== undefined || input.clientId !== undefined))) {
      item = await validateWorkItem(actor, {
        activityId: input.activityId ?? row.activityId ?? undefined,
        projectId: input.projectId === undefined ? row.projectId : input.projectId,
        clientId: input.clientId === undefined ? row.clientId : input.clientId,
      });
    }
    const override = input.billableOverride === undefined ? row.billableOverride : input.billableOverride;
    const logBillable = await billableFor(item, override, policy);
    const ok = await TimesheetRepository.updateRowWithLogs(
      row.id,
      input.expectedVersion,
      { ...item, billableOverride: override },
      logBillable,
      actor.userId,
    );
    if (!ok) throw new ConflictError("This line changed since you opened it — refresh and try again.");
    await audit(
      actor,
      "TIMESHEET_ROW_UPDATED",
      "Timesheet",
      sheet.id,
      { rowId: row.id, ...item, billableOverride: override },
      { ...workItemOf(row), billableOverride: row.billableOverride },
    );
    return rowDto(actor, ctx, sheet, row.id);
  },

  async removeRow(actor: Actor, rowId: string): Promise<void> {
    const ctx = await loadContext(actor.organizationId);
    const { row, sheet } = await ownRow(actor, rowId);
    const policy = await policyOf(sheet, requirePeriod(ctx, toIsoDate(sheet.periodStart)).policy);
    requireWholeWeekEdit(await writableMode(actor, sheet, policy));
    await TimesheetRepository.softDeleteRowAndLogs(row.id, actor.userId);
    await audit(actor, "TIMESHEET_ROW_REMOVED", "Timesheet", sheet.id, { rowId: row.id, ...workItemOf(row) });
  },

  // Duplicate copies the work item and tags, never hours (BR-18).
  async duplicateRow(actor: Actor, rowId: string): Promise<TimesheetRowDto> {
    const ctx = await loadContext(actor.organizationId);
    const { row, sheet } = await ownRow(actor, rowId);
    const policy = await policyOf(sheet, requirePeriod(ctx, toIsoDate(sheet.periodStart)).policy);
    requireWholeWeekEdit(await writableMode(actor, sheet, policy));
    const copy = await TimesheetRepository.insertBelow(
      { id: row.id, timesheetId: sheet.id, position: row.position, ...workItemOf(row) },
      actor.userId,
    );
    await audit(actor, "TIMESHEET_ROW_ADDED", "Timesheet", sheet.id, { rowId: copy.id, duplicateOf: row.id });
    return rowDto(actor, ctx, sheet, copy.id);
  },

  async moveRow(actor: Actor, rowId: string, direction: "up" | "down"): Promise<void> {
    const ctx = await loadContext(actor.organizationId);
    const { row, sheet } = await ownRow(actor, rowId);
    const policy = await policyOf(sheet, requirePeriod(ctx, toIsoDate(sheet.periodStart)).policy);
    requireWholeWeekEdit(await writableMode(actor, sheet, policy));
    const ids = (await TimesheetRepository.rows(sheet.id)).map((r) => r.id);
    const index = ids.indexOf(row.id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ids.length) return; // past either end: a no-op
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    await TimesheetRepository.setRowOrder(ids, actor.userId);
    await audit(actor, "TIMESHEET_ROW_MOVED", "Timesheet", sheet.id, { rowId: row.id, direction });
  },

  // BR-20: copy last period's rows that are not already here. Never hours.
  async copyPrevious(actor: Actor, periodStart: IsoDate): Promise<TimesheetWeekDto> {
    const ctx = await loadContext(actor.organizationId);
    const period = requirePeriodStart(ctx, periodStart);
    const previous = requirePeriod(ctx, addDays(period.start, -1));
    const prevSheet = await TimesheetRepository.findSheet(actor.userId, fromIsoDate(previous.start));
    const sheet = await ensureSheet(actor, period);
    const policy = await policyOf(sheet, period.policy);
    requireWholeWeekEdit(await writableMode(actor, sheet, policy));
    if (prevSheet) {
      const [prevRows, rows] = await Promise.all([
        TimesheetRepository.rows(prevSheet.id),
        TimesheetRepository.rows(sheet.id),
      ]);
      const present = rows.map(workItemOf);
      let copied = 0;
      for (const prev of prevRows) {
        const item = workItemOf(prev);
        if (present.some((p) => sameItem(p, item))) continue;
        // An issue or activity that has since become unusable is skipped,
        // not copied into a row the person then cannot fill.
        try {
          await validateWorkItem(actor, {
            issueId: item.issueId ?? undefined,
            activityId: item.activityId ?? undefined,
            projectId: item.projectId,
            clientId: item.clientId,
          });
        } catch {
          continue;
        }
        await TimesheetRepository.appendRow({ ...item, timesheetId: sheet.id, actorId: actor.userId });
        present.push(item);
        copied += 1;
      }
      await audit(actor, "TIMESHEET_ROWS_COPIED", "Timesheet", sheet.id, { from: previous.start, copied });
    }
    return weekFor(actor, ctx, period);
  },

  // ── Pinned rows (BR-19) — preferences, allowed in any week state ─────────

  async pinRow(actor: Actor, rowId: string): Promise<PinnedTimesheetRowDto> {
    const { row, sheet } = await ownRow(actor, rowId);
    let pinnedId = row.pinnedRowId;
    if (!pinnedId) {
      const pinned = await TimesheetRepository.createPinnedRow({
        ...workItemOf(row),
        organizationId: actor.organizationId,
        userId: actor.userId,
      });
      pinnedId = pinned.id;
      await TimesheetRepository.setRowPin(row.id, pinnedId, actor.userId);
      await audit(actor, "PINNED_ROW_CREATED", "PinnedTimesheetRow", pinnedId, { fromRow: row.id, timesheetId: sheet.id });
    }
    const all = await TimesheetService.listPinned(actor);
    return all.find((p) => p.id === pinnedId)!;
  },

  async unpinRow(actor: Actor, rowId: string): Promise<void> {
    const { row } = await ownRow(actor, rowId);
    if (!row.pinnedRowId) return;
    await TimesheetRepository.softDeletePinnedRow(row.pinnedRowId, actor.userId);
    await TimesheetRepository.setRowPin(row.id, null, actor.userId);
    await audit(actor, "PINNED_ROW_REMOVED", "PinnedTimesheetRow", row.pinnedRowId, { fromRow: row.id });
  },

  async listPinned(actor: Actor): Promise<PinnedTimesheetRowDto[]> {
    const pins = await TimesheetRepository.pinnedRows(actor.userId);
    return pins.map((p) => ({
      id: p.id,
      position: p.position,
      kind: p.issueId ? "ISSUE" : "ACTIVITY",
      label: p.issue ? `${p.issue.key} ${p.issue.title}` : (p.activity?.name ?? ""),
      projectName: p.issue?.project.name ?? p.project?.name ?? null,
      clientName: p.client?.name ?? null,
    }));
  },

  async addPinned(actor: Actor, input: RowInput): Promise<PinnedTimesheetRowDto> {
    await loadContext(actor.organizationId);
    const item = await validateWorkItem(actor, input);
    const created = await TimesheetRepository.createPinnedRow({
      ...item,
      organizationId: actor.organizationId,
      userId: actor.userId,
    });
    await audit(actor, "PINNED_ROW_CREATED", "PinnedTimesheetRow", created.id, { ...item });
    return (await TimesheetService.listPinned(actor)).find((p) => p.id === created.id)!;
  },

  async reorderPinned(actor: Actor, pinnedRowId: string, position: number): Promise<PinnedTimesheetRowDto> {
    const pinned = await TimesheetRepository.findPinnedRow(pinnedRowId);
    if (!pinned || pinned.userId !== actor.userId) throw new NotFoundError("Recurring row not found.");
    await TimesheetRepository.reorderPinnedRow(actor.userId, pinnedRowId, position, actor.userId);
    return (await TimesheetService.listPinned(actor)).find((p) => p.id === pinnedRowId)!;
  },

  async removePinned(actor: Actor, pinnedRowId: string): Promise<void> {
    const pinned = await TimesheetRepository.findPinnedRow(pinnedRowId);
    if (!pinned || pinned.userId !== actor.userId) throw new NotFoundError("Recurring row not found.");
    await TimesheetRepository.softDeletePinnedRow(pinnedRowId, actor.userId);
    await audit(actor, "PINNED_ROW_REMOVED", "PinnedTimesheetRow", pinnedRowId, {});
  },

  // ── Submit (BR-24, BR-29, BR-30) ──────────────────────────────────────────

  async submit(actor: Actor, periodStart: IsoDate, expectedVersion: number): Promise<TimesheetWeekDto> {
    const ctx = await loadContext(actor.organizationId);
    const period = requirePeriodStart(ctx, periodStart);
    const sheet = await TimesheetRepository.findSheet(actor.userId, fromIsoDate(period.start));
    if (!sheet) {
      throw new ValidationError("Nothing to submit.", {
        code: "SUBMIT_BLOCKED",
        problems: [{ code: "EMPTY_WEEK", message: "Nothing is logged this week", rowId: null, date: null }],
      });
    }
    const policy = await policyOf(sheet, period.policy);
    const mode = await editModeOf(sheet, policy, todayIn(policy.timezone));
    if (mode === "READONLY") {
      throw new ConflictError(sheet.lockedAt ? "This week is locked." : "This week has already been submitted.");
    }
    if (sheet.version !== expectedVersion) {
      throw new ConflictError("This week changed since you opened it — refresh and try again.");
    }

    // The same problems the screen shows (BR-24), computed once by the week
    // builder, so the panel and the server can never disagree.
    const week = await weekFor(actor, ctx, period);
    if (week.problems.length > 0) {
      throw new ValidationError("Fix the listed problems before submitting.", {
        code: "SUBMIT_BLOCKED",
        problems: week.problems,
      });
    }

    const rows = await TimesheetRepository.rows(sheet.id);
    const projectIds = [...new Set(rows.flatMap((r) => {
      const pid = r.issue ? r.issue.project.id : r.projectId;
      return pid ? [pid] : [];
    }))];
    const [reportingManagerId, functionalManagerId, leads, orgAdminIds] = await Promise.all([
      TimesheetRepository.teamManagerOf(actor.userId),
      TimesheetRepository.functionalManagerOf(actor.userId),
      projectIds.length ? TimesheetRepository.projectLeads(projectIds) : Promise.resolve([]),
      TimesheetRepository.orgAdminIds(actor.organizationId),
    ]);
    const plan = planApprovers({
      ownerId: actor.userId,
      relations: policy.approverRelations,
      reportingManagerId,
      functionalManagerId,
      projects: projectIds.map((projectId) => ({
        projectId,
        leadIds: leads.filter((l) => l.projectId === projectId).map((l) => l.userId),
      })),
      hasLinesWithoutProject: rows.some((r) => !r.issue && !r.projectId),
      orgAdminIds,
    });

    const round = sheet.round + 1;
    const late = Date.now() > deadlineFor(period.end, policy).getTime();
    const ok = await TimesheetRepository.submit({
      timesheetId: sheet.id,
      expectedVersion: sheet.version,
      round,
      submittedLate: late,
      expectedMinutes: week.totals.expectedMinutes,
      actorId: actor.userId,
      slots: plan.kind === "SLOTS" ? plan.slots : [],
      autoApprove: plan.kind === "AUTO_APPROVE" ? { lock: policy.autoLockOnApproval } : null,
    });
    if (!ok) throw new ConflictError("This week changed since you opened it — refresh and try again.");

    await audit(actor, "TIMESHEET_SUBMITTED", "Timesheet", sheet.id, {
      round,
      late,
      approvers: plan.kind === "SLOTS" ? plan.slots.map((s) => ({ relation: s.relation, approverId: s.approverId, projectId: s.projectId, fallbackFrom: s.fallbackFrom })) : [],
    });
    if (plan.kind === "AUTO_APPROVE") {
      await audit(actor, "TIMESHEET_AUTO_APPROVED", "Timesheet", sheet.id, {
        round,
        reason: "no other approver available",
      });
    } else {
      const owner = await TimesheetRepository.userName(actor.userId);
      await NotificationService.timesheetSubmitted(actor, {
        timesheetId: sheet.id,
        approverIds: [...new Set(plan.slots.map((s) => s.approverId))],
        ownerName: owner?.name ?? "Someone",
        periodLabel: periodLabel(period.start, period.end),
      });
    }
    return weekFor(actor, ctx, period);
  },

  // ── Pickers (BR-21, BR-22) ────────────────────────────────────────────────

  async issueOptions(actor: Actor, periodStart: IsoDate, q?: string): Promise<{ suggested: TimesheetIssueOptionDto[]; results: TimesheetIssueOptionDto[] }> {
    const ctx = await loadContext(actor.organizationId);
    const period = requirePeriod(ctx, periodStart);
    const base = { organizationId: actor.organizationId, userId: actor.userId, isAdmin: actor.orgRole === "ADMIN" };
    const toDto = (reason: TimesheetIssueOptionDto["reason"]) =>
      (i: { id: string; key: string; title: string; project: { name: string } }): TimesheetIssueOptionDto => ({
        id: i.id,
        key: i.key,
        title: i.title,
        projectName: i.project.name,
        reason,
      });

    if (q) {
      const results = await TimesheetRepository.pickerIssues({
        ...base,
        where: {
          OR: [
            { key: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 20,
      });
      return { suggested: [], results: results.map(toDto("SEARCH")) };
    }
    const sheet = await TimesheetRepository.findSheet(actor.userId, fromIsoDate(period.start));
    const workedIds = sheet
      ? (await TimesheetRepository.workedIssueIds(sheet.id)).flatMap((r) => (r.issueId ? [r.issueId] : []))
      : [];
    const [assigned, worked] = await Promise.all([
      TimesheetRepository.pickerIssues({ ...base, where: { assigneeId: actor.userId, status: { not: "DONE" } }, take: 15 }),
      workedIds.length
        ? TimesheetRepository.pickerIssues({ ...base, where: { id: { in: workedIds } }, take: 15 })
        : Promise.resolve([]),
    ]);
    const seen = new Set<string>();
    const suggested = [...assigned.map(toDto("ASSIGNED")), ...worked.map(toDto("WORKED_THIS_PERIOD"))].filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return true;
    });
    return { suggested: suggested.slice(0, 20), results: [] };
  },

  async activityOptions(actor: Actor, q?: string, categoryId?: string): Promise<ActivityPickerDto> {
    await loadContext(actor.organizationId);
    const teamId = await TimesheetRepository.teamIdOf(actor.userId);
    const [activities, favouriteIds, recentIds] = await Promise.all([
      ActivityRepository.visible({ organizationId: actor.organizationId, teamId, q, categoryId }),
      FavoriteService.starredActivityIds(actor),
      ActivityRepository.recentIds(actor.userId, 10),
    ]);
    const option = (a: (typeof activities)[number]) => ({
      id: a.id,
      name: a.name,
      categoryId: a.categoryId,
      requiresProject: a.requiresProject,
      requiresClient: a.requiresClient,
      notesRequired: a.notesRequired,
      favourite: favouriteIds.has(a.id),
    });
    const byId = new Map(activities.map((a) => [a.id, a]));
    const categories = new Map<string, { id: string; name: string; activities: ReturnType<typeof option>[] }>();
    for (const a of activities) {
      const c = categories.get(a.category.id) ?? { id: a.category.id, name: a.category.name, activities: [] };
      c.activities.push(option(a));
      categories.set(a.category.id, c);
    }
    return {
      favourites: activities.filter((a) => favouriteIds.has(a.id)).map(option),
      recents: recentIds.flatMap((id) => {
        const a = byId.get(id);
        return a ? [option(a)] : [];
      }),
      categories: [...categories.values()],
    };
  },

  async setActivityFavourite(actor: Actor, activityId: string, on: boolean): Promise<void> {
    const activity = await ActivityRepository.findById(activityId);
    if (!activity || activity.organizationId !== actor.organizationId) throw new NotFoundError("Activity not found.");
    if (on) await FavoriteService.starActivity(actor, activityId);
    else await FavoriteService.unstarActivity(actor, activityId);
  },

  // ── Bridge for module 19 (issue-page logging, ADR-0059 §6.2) ─────────────

  // Where an issue-page log goes: the owner's week for that date (created if
  // needed) and its first row for the issue (created if needed). Refuses a
  // week that is submitted, approved or locked.
  async placeIssueLog(
    actor: Actor,
    issueId: string,
    workDate: IsoDate,
  ): Promise<{ timesheetId: string; timesheetRowId: string; billable: boolean; billableOverridden: boolean }> {
    const ctx = await loadContext(actor.organizationId);
    const period = requirePeriod(ctx, workDate);
    const sheet = await ensureSheet(actor, period);
    const policy = await policyOf(sheet, period.policy);
    const mode = await writableMode(actor, sheet, policy);
    let row = await TimesheetRepository.firstIssueRow(sheet.id, issueId);
    if (mode === "RETURNED_ONLY" && !row?.returnedAt) {
      throw new ConflictError("Only the returned lines of that week can be changed until you resubmit.");
    }
    if (!row) row = await TimesheetRepository.appendRow({ issueId, activityId: null, projectId: null, clientId: null, timesheetId: sheet.id, actorId: actor.userId });
    return {
      timesheetId: sheet.id,
      timesheetRowId: row.id,
      billable: billableForRow(row, policy),
      billableOverridden: row.billableOverride !== null,
    };
  },

  // Gate for editing or deleting an existing log from the issue page. Returns
  // the week's status so a LEAD's moderation delete can be limited to DRAFT.
  async assertLogWritable(actor: Actor, timesheetId: string, timesheetRowId: string, asOwner: boolean): Promise<void> {
    const sheet = await TimesheetRepository.findSheetById(timesheetId);
    if (!sheet) throw new NotFoundError("Work log not found.");
    const ctx = await loadContext(sheet.organizationId);
    const policy = await policyOf(sheet, requirePeriod(ctx, toIsoDate(sheet.periodStart)).policy);
    const mode = await editModeOf(sheet, policy, todayIn(policy.timezone));
    if (!asOwner) {
      // ADR-0059 Q8: a LEAD removes someone else's time only from a DRAFT week.
      if (mode !== "EDIT") throw new ConflictError("Time can only be removed from a week that is still a draft.");
      return;
    }
    const writable = await writableMode(actor, sheet, policy);
    if (writable === "RETURNED_ONLY") {
      const row = await TimesheetRepository.findRow(timesheetRowId);
      if (!row?.returnedAt) throw new ConflictError("Only the returned lines can be changed until you resubmit.");
    }
  },
};
