// Shared, read-only assembly of a week (37_timesheets §4 GET) — used by the
// owner's service and the approval service so both answer in one shape.
// Everything here is derived; nothing writes.

import {
  TimesheetRepository,
  type CellLogRecord,
  type PolicyRecord,
  type TimesheetRecord,
  type TimesheetRowRecord,
} from "@/features/timesheets/repositories/timesheet.repository";
import { describeWorkingWeek } from "@/features/workload/lib/capacity";
import {
  addDays,
  daysBetween,
  deadlineFor,
  fromIsoDate,
  periodStartFor,
  toIsoDate,
  todayIn,
  type IsoDate,
} from "@/features/timesheets/lib/period";
import { findProblems, isOvertime, planDays, resolveBillable, type DayPlan } from "@/features/timesheets/lib/rules";
import type {
  TimesheetCellDto,
  TimesheetDayDto,
  TimesheetRowDto,
  TimesheetTotalsDto,
  TimesheetWeekDto,
} from "@/features/timesheets/types/timesheet.types";

// ADR-0059 Q14: "client required" is not enforced until the Clients admin
// screen exists (TS-5). One switch, so turning it on is a one-line change.
export const ENFORCE_CLIENT_REQUIREMENT = false;

export interface OrgSettings {
  workingMinutesPerDay: number;
  workingDaysPerWeek: number;
  hrConnectedAt: Date | null;
}

export interface Period {
  policy: PolicyRecord;
  start: IsoDate;
  end: IsoDate;
}

// The policy in force on `date`: the latest one whose effectiveFrom is on or
// before it (BR-2). Policies are insert-only, so this is the whole history.
export function policyAt(policies: PolicyRecord[], date: IsoDate): PolicyRecord | null {
  let found: PolicyRecord | null = null;
  for (const p of policies) if (toIsoDate(p.effectiveFrom) <= date) found = p;
  return found;
}

// A period never straddles a policy change: it starts no earlier than its
// policy and ends the day before the next one (ADR-0059 Q16).
export function periodFor(policies: PolicyRecord[], date: IsoDate): Period | null {
  const policy = policyAt(policies, date);
  if (!policy) return null;
  const from = toIsoDate(policy.effectiveFrom);
  let start = periodStartFor(date, policy.weekStartDay);
  if (start < from) start = from;
  let end = addDays(periodStartFor(date, policy.weekStartDay), 6);
  const next = policies.find((p) => toIsoDate(p.effectiveFrom) > date);
  if (next && toIsoDate(next.effectiveFrom) <= end) end = addDays(toIsoDate(next.effectiveFrom), -1);
  return { policy, start, end };
}

export type EditMode = "EDIT" | "REOPENED" | "RETURNED_ONLY" | "READONLY";

export function isLocked(sheet: TimesheetRecord, policy: PolicyRecord, today: IsoDate): boolean {
  if (sheet.lockedAt) return true;
  return policy.lockAfterDays !== null && today > addDays(toIsoDate(sheet.periodEnd), policy.lockAfterDays);
}

// What the owner may do to a week right now (ADR-0059 §4, §6.5).
export async function editModeOf(
  sheet: TimesheetRecord | null,
  policy: PolicyRecord,
  today: IsoDate,
): Promise<EditMode> {
  if (!sheet) return "EDIT";
  if (isLocked(sheet, policy, today)) return "READONLY";
  if (sheet.status === "DRAFT") return "EDIT";
  if (sheet.status === "RETURNED") return "RETURNED_ONLY";
  if (sheet.status === "APPROVED") {
    // An approved week is read-only — unless an admin unlocked it after it was
    // approved; then the first edit sends it back to DRAFT (BR-34).
    const unlock = await TimesheetRepository.lastUnlock(sheet.id);
    if (unlock && sheet.approvedAt && unlock.createdAt > sheet.approvedAt) return "REOPENED";
  }
  return "READONLY";
}

export function rowEditable(mode: EditMode, row: { returnedAt: Date | null }): boolean {
  if (mode === "EDIT" || mode === "REOPENED") return true;
  if (mode === "RETURNED_ONLY") return row.returnedAt !== null;
  return false;
}

function rowProjectId(row: TimesheetRowRecord): string | null {
  return row.issue ? row.issue.project.id : row.projectId;
}

function resolvedRowBillable(row: TimesheetRowRecord, policy: PolicyRecord): boolean {
  return resolveBillable({
    override: row.billableOverride,
    issueDefault: row.issue?.defaultBillable ?? null,
    activityDefault: row.activity?.billable ?? null,
    projectDefault: row.issue ? row.issue.project.defaultBillable : (row.project?.defaultBillable ?? null),
    clientDefault: row.issue
      ? (row.issue.project.client?.defaultBillable ?? null)
      : (row.client?.defaultBillable ?? row.project?.client?.defaultBillable ?? null),
    policyDefault: policy.defaultBillable,
  });
}

export function billableForRow(row: TimesheetRowRecord, policy: PolicyRecord): boolean {
  return resolvedRowBillable(row, policy);
}

function noteNeeded(row: TimesheetRowRecord, billable: boolean, policy: PolicyRecord): boolean {
  return (
    Boolean(row.activity?.notesRequired) ||
    policy.notesRequired === "ALL" ||
    (policy.notesRequired === "BILLABLE" && billable)
  );
}

export interface BuildInput {
  organizationId: string;
  viewerId: string;
  ownerId: string;
  isAdmin: boolean;
  sheet: TimesheetRecord | null;
  period: Period;
  settings: OrgSettings;
  // When set, only rows of these projects are shown (a PROJECT-only approver).
  visibleProjectIds?: Set<string> | null;
}

export async function buildWeek(input: BuildInput): Promise<TimesheetWeekDto> {
  const { sheet, period, settings } = input;
  const policy = sheet ? ((await TimesheetRepository.policyById(sheet.policyId)) ?? period.policy) : period.policy;
  const today = todayIn(policy.timezone);
  const days = daysBetween(period.start, period.end);
  const from = fromIsoDate(period.start);
  const to = fromIsoDate(period.end);
  const hrConnected = settings.hrConnectedAt !== null;

  const [holidays, leave] = hrConnected
    ? await Promise.all([
        TimesheetRepository.holidays(input.organizationId, from, to),
        TimesheetRepository.approvedLeave(input.ownerId, from, to),
      ])
    : [[], []];

  const plan: DayPlan[] = planDays({
    days,
    weekStartDay: policy.weekStartDay,
    workingMinutesPerDay: settings.workingMinutesPerDay,
    workingDaysPerWeek: settings.workingDaysPerWeek,
    hrConnected,
    holidays: new Map(holidays.map((h) => [toIsoDate(h.date), h.name])),
    leave: new Map(leave.map((l) => [toIsoDate(l.date), { minutes: l.minutes, type: l.type }])),
  });

  const mode = await editModeOf(sheet, policy, today);
  const isOwner = input.viewerId === input.ownerId;
  const canEditWeek = isOwner && mode !== "READONLY";

  let rows: TimesheetRowRecord[] = [];
  let logs: CellLogRecord[] = [];
  let virtualPins: TimesheetRowDto[] = [];
  if (sheet) {
    [rows, logs] = await Promise.all([TimesheetRepository.rows(sheet.id), TimesheetRepository.logs(sheet.id)]);
  } else if (isOwner) {
    virtualPins = await virtualPinnedRows(input.ownerId, days, policy);
  }
  if (input.visibleProjectIds) {
    const visible = input.visibleProjectIds;
    rows = rows.filter((r) => {
      const pid = rowProjectId(r);
      return pid !== null && visible.has(pid);
    });
    const ids = new Set(rows.map((r) => r.id));
    logs = logs.filter((l) => ids.has(l.timesheetRowId));
  }

  const logsByCell = new Map<string, CellLogRecord[]>();
  for (const l of logs) {
    const key = `${l.timesheetRowId}|${toIsoDate(l.workDate)}`;
    const list = logsByCell.get(key) ?? [];
    list.push(l);
    logsByCell.set(key, list);
  }

  const rowDtos: TimesheetRowDto[] = rows.map((row) => {
    const resolved = resolvedRowBillable(row, policy);
    const rowLogs = logs.filter((l) => l.timesheetRowId === row.id);
    // A week's stored flags are the record (BR-10); the resolved value is
    // only the answer for a row with nothing logged yet.
    const billable = rowLogs[0]?.billable ?? resolved;
    const needsNote = noteNeeded(row, billable, policy);
    const cells: TimesheetCellDto[] = days.map((date) => {
      const cell = logsByCell.get(`${row.id}|${date}`) ?? [];
      const single = cell.length === 1 ? cell[0]! : null;
      return {
        date,
        minutes: cell.reduce((s, l) => s + l.minutes, 0),
        logCount: cell.length,
        logId: single?.id ?? null,
        version: single?.version ?? null,
        note: single?.note ?? (cell.length > 1 ? (cell.find((l) => l.note)?.note ?? null) : null),
        noteRequired: needsNote,
      };
    });
    return {
      id: row.id,
      position: row.position,
      kind: row.issueId ? "ISSUE" : "ACTIVITY",
      issue: row.issue
        ? { id: row.issue.id, key: row.issue.key, title: row.issue.title, projectName: row.issue.project.name }
        : null,
      activity: row.activity
        ? {
            id: row.activity.id,
            name: row.activity.name,
            categoryName: row.activity.category.name,
            requiresProject: row.activity.requiresProject,
            requiresClient: row.activity.requiresClient,
          }
        : null,
      project: row.project ? { id: row.project.id, name: row.project.name } : null,
      client: row.client ? { id: row.client.id, name: row.client.name } : null,
      billable,
      billableOverridden: row.billableOverride !== null,
      pinned: row.pinnedRowId !== null,
      returnedReason: row.returnedReason,
      editable: canEditWeek && rowEditable(mode, row),
      cells,
      totalMinutes: cells.reduce((s, c) => s + c.minutes, 0),
      version: row.version,
    };
  });

  const allRows = [...rowDtos, ...virtualPins];
  const dayDtos: TimesheetDayDto[] = plan.map((p) => {
    const total = allRows.reduce((s, r) => s + (r.cells.find((c) => c.date === p.date)?.minutes ?? 0), 0);
    return {
      date: p.date,
      kind: p.kind,
      label: p.label,
      expectedMinutes: p.expectedMinutes,
      totalMinutes: total,
      overtime: isOvertime(total, policy.overtimeDailyMinutes, settings.workingMinutesPerDay),
      editable: canEditWeek && p.date <= today,
    };
  });

  const totals: TimesheetTotalsDto = {
    loggedMinutes: logs.reduce((s, l) => s + l.minutes, 0),
    expectedMinutes:
      sheet?.expectedMinutesAtSubmit ?? plan.reduce((s, p) => s + p.expectedMinutes, 0),
    billableMinutes: logs.filter((l) => l.billable).reduce((s, l) => s + l.minutes, 0),
    nonBillableMinutes: logs.filter((l) => !l.billable).reduce((s, l) => s + l.minutes, 0),
  };

  const problems = canEditWeek
    ? findProblems({
        notesRequired: policy.notesRequired,
        enforceClientRequirement: ENFORCE_CLIENT_REQUIREMENT,
        rows: rows.map((row) => {
          const dto = rowDtos.find((d) => d.id === row.id)!;
          return {
            id: row.id,
            label: row.issue ? `${row.issue.key} ${row.issue.title}` : (row.activity?.name ?? "Activity"),
            isActivity: row.activityId !== null,
            billable: dto.billable,
            activityNotesRequired: Boolean(row.activity?.notesRequired),
            requiresProject: Boolean(row.activity?.requiresProject),
            requiresClient: Boolean(row.activity?.requiresClient),
            hasProject: row.projectId !== null,
            hasClient: row.clientId !== null,
            cells: days.map((date) => {
              const cell = logsByCell.get(`${row.id}|${date}`) ?? [];
              return { date, minutes: cell.reduce((s, l) => s + l.minutes, 0), notes: cell.map((l) => l.note) };
            }),
          };
        }),
      })
    : [];

  const approvals = sheet && sheet.round > 0 ? await TimesheetRepository.approvals(sheet.id, sheet.round) : [];
  const projectIds = [...new Set(approvals.flatMap((a) => (a.projectId ? [a.projectId] : [])))];
  const projectNames = new Map(
    (projectIds.length ? await TimesheetRepository.projectNames(projectIds) : []).map((p) => [p.id, p.name]),
  );
  const unlock = sheet ? await TimesheetRepository.lastUnlock(sheet.id) : null;
  const unlockAfter = unlock?.afterData as { reason?: string } | null | undefined;
  const unlocker = unlock?.actorId ? await TimesheetRepository.userName(unlock.actorId) : null;

  const locked = sheet ? isLocked(sheet, policy, today) : false;
  return {
    id: sheet?.id ?? null,
    periodStart: period.start,
    periodEnd: period.end,
    status: sheet?.status ?? "DRAFT",
    locked,
    lockedAt: sheet?.lockedAt?.toISOString() ?? null,
    autoApproved: sheet?.autoApproved ?? false,
    unlockedBy:
      unlock && unlocker
        ? { name: unlocker.name, at: unlock.createdAt.toISOString(), reason: unlockAfter?.reason ?? "" }
        : null,
    submittedAt: sheet?.submittedAt?.toISOString() ?? null,
    submittedLate: sheet?.submittedLate ?? false,
    dueAt: deadlineFor(period.end, policy).toISOString(),
    version: sheet?.version ?? 0,
    hrConnected,
    workingWeek: describeWorkingWeek({
      minutesPerDay: settings.workingMinutesPerDay,
      daysPerWeek: settings.workingDaysPerWeek,
    }),
    days: dayDtos,
    rows: allRows,
    totals,
    approvals: approvals.map((a) => ({
      round: a.round,
      relation: a.relation,
      project: a.projectId ? { id: a.projectId, name: projectNames.get(a.projectId) ?? "" } : null,
      approver: a.approver,
      status: a.status,
      fallbackFrom: a.fallbackFrom,
      decidedAt: a.decidedAt?.toISOString() ?? null,
      comment: a.comment,
    })),
    returnComment:
      sheet?.status === "RETURNED" ? (approvals.find((a) => a.status === "RETURNED")?.comment ?? null) : null,
    problems,
    permissions: {
      canEdit: canEditWeek,
      canSubmit: isOwner && (mode === "EDIT" || mode === "RETURNED_ONLY" || mode === "REOPENED") && sheet?.status !== "SUBMITTED",
      canOverrideBillable: canEditWeek && policy.employeesMayOverrideBillable,
      canUnlock: Boolean(sheet) && locked && input.isAdmin && !isOwner,
    },
  };
}

// The owner's pinned rows, shown in a week that does not exist yet. Their id
// is `pinned:<id>`; the first write to one creates the week (37 §4).
async function virtualPinnedRows(ownerId: string, days: IsoDate[], policy: PolicyRecord): Promise<TimesheetRowDto[]> {
  const pins = await TimesheetRepository.pinnedRows(ownerId);
  return pins.map((p, index) => ({
    id: `pinned:${p.id}`,
    position: index,
    kind: p.issueId ? "ISSUE" : "ACTIVITY",
    issue: p.issue && p.issueId
      ? { id: p.issueId, key: p.issue.key, title: p.issue.title, projectName: p.issue.project.name }
      : null,
    activity: p.activity && p.activityId
      ? { id: p.activityId, name: p.activity.name, categoryName: "", requiresProject: false, requiresClient: false }
      : null,
    project: p.project && p.projectId ? { id: p.projectId, name: p.project.name } : null,
    client: p.client && p.clientId ? { id: p.clientId, name: p.client.name } : null,
    billable: policy.defaultBillable,
    billableOverridden: false,
    pinned: true,
    returnedReason: null,
    editable: true,
    cells: days.map((date) => ({
      date,
      minutes: 0,
      logCount: 0,
      logId: null,
      version: null,
      note: null,
      noteRequired: false,
    })),
    totalMinutes: 0,
    version: 0,
  }));
}
