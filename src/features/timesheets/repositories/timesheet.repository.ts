import { Prisma, type ApproverRelation } from "@prisma/client";
import { prisma } from "@/shared/lib/db";

// Data access for module 37 (ADR-0059). Prisma lives only here (Feature
// Architecture §4); RBAC, state rules and audit are the service's job.
// Multi-step writes that must not half-happen are one transaction each.

const DEFAULT_POLICY_EFFECTIVE_FROM = new Date("2000-01-03T00:00:00.000Z"); // a Monday

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const rowSelect = {
  id: true,
  timesheetId: true,
  position: true,
  issueId: true,
  activityId: true,
  projectId: true,
  clientId: true,
  billableOverride: true,
  pinnedRowId: true,
  returnedAt: true,
  returnedReason: true,
  version: true,
  issue: {
    select: {
      id: true,
      key: true,
      title: true,
      defaultBillable: true,
      project: {
        select: {
          id: true,
          name: true,
          status: true,
          defaultBillable: true,
          client: { select: { defaultBillable: true } },
        },
      },
    },
  },
  activity: {
    select: {
      id: true,
      name: true,
      billable: true,
      requiresProject: true,
      requiresClient: true,
      notesRequired: true,
      category: { select: { name: true } },
    },
  },
  project: {
    select: { id: true, name: true, defaultBillable: true, client: { select: { defaultBillable: true } } },
  },
  client: { select: { id: true, name: true, defaultBillable: true } },
} as const;

export type TimesheetRowRecord = Prisma.TimesheetRowGetPayload<{ select: typeof rowSelect }>;

const sheetSelect = {
  id: true,
  organizationId: true,
  userId: true,
  periodStart: true,
  periodEnd: true,
  policyId: true,
  status: true,
  round: true,
  submittedAt: true,
  submittedLate: true,
  approvedAt: true,
  autoApproved: true,
  lockedAt: true,
  expectedMinutesAtSubmit: true,
  version: true,
} as const;

export type TimesheetRecord = Prisma.TimesheetGetPayload<{ select: typeof sheetSelect }>;

const logSelect = {
  id: true,
  timesheetRowId: true,
  workDate: true,
  minutes: true,
  note: true,
  billable: true,
  version: true,
} as const;

export type CellLogRecord = Prisma.WorkLogGetPayload<{ select: typeof logSelect }>;

const policySelect = {
  id: true,
  effectiveFrom: true,
  timezone: true,
  weekStartDay: true,
  dueWeekday: true,
  dueTime: true,
  autoLockOnApproval: true,
  lockAfterDays: true,
  overtimeDailyMinutes: true,
  notesRequired: true,
  employeesMayOverrideBillable: true,
  defaultBillable: true,
  approverRelations: true,
  approvalMode: true,
} as const;

export type PolicyRecord = Prisma.TimesheetPolicyGetPayload<{ select: typeof policySelect }>;

// The fields a row and its logs share (ADR-0059 §3.2).
export interface WorkItem {
  issueId: string | null;
  activityId: string | null;
  projectId: string | null;
  clientId: string | null;
}

export const TimesheetRepository = {
  // ── Organization settings and policy ──────────────────────────────────────

  orgSettings(organizationId: string) {
    return prisma.organization.findUnique({
      where: { id: organizationId },
      select: { workingMinutesPerDay: true, workingDaysPerWeek: true, hrConnectedAt: true },
    });
  },

  policies(organizationId: string): Promise<PolicyRecord[]> {
    return prisma.timesheetPolicy.findMany({
      where: { organizationId },
      select: policySelect,
      orderBy: { effectiveFrom: "asc" },
    });
  },

  policyById(id: string) {
    return prisma.timesheetPolicy.findUnique({ where: { id }, select: policySelect });
  },

  // Idempotent: the unique (organizationId, effectiveFrom) makes a concurrent
  // second call a no-op.
  async ensureDefaultPolicy(organizationId: string, timezone: string): Promise<void> {
    await prisma.timesheetPolicy.createMany({
      data: [{ organizationId, effectiveFrom: DEFAULT_POLICY_EFFECTIVE_FROM, timezone }],
      skipDuplicates: true,
    });
  },

  // ── Timesheets ────────────────────────────────────────────────────────────

  findSheet(userId: string, periodStart: Date): Promise<TimesheetRecord | null> {
    return prisma.timesheet.findUnique({
      where: { userId_periodStart: { userId, periodStart } },
      select: sheetSelect,
    });
  },

  findSheetById(id: string): Promise<TimesheetRecord | null> {
    return prisma.timesheet.findFirst({ where: { id, deletedAt: null }, select: sheetSelect });
  },

  // Creates the week and instantiates the owner's pinned rows into it, in one
  // transaction. A concurrent creator loses on the unique key; the caller
  // re-reads (isUniqueViolation).
  createSheetWithPinnedRows(input: {
    organizationId: string;
    userId: string;
    periodStart: Date;
    periodEnd: Date;
    policyId: string;
  }): Promise<TimesheetRecord> {
    return prisma.$transaction(async (tx) => {
      const sheet = await tx.timesheet.create({
        data: { ...input, createdBy: input.userId },
        select: sheetSelect,
      });
      const pins = await tx.pinnedTimesheetRow.findMany({
        where: { userId: input.userId, deletedAt: null },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, issueId: true, activityId: true, projectId: true, clientId: true },
      });
      if (pins.length > 0) {
        await tx.timesheetRow.createMany({
          data: pins.map((p, index) => ({
            timesheetId: sheet.id,
            position: index,
            issueId: p.issueId,
            activityId: p.activityId,
            projectId: p.projectId,
            clientId: p.clientId,
            pinnedRowId: p.id,
            createdBy: input.userId,
          })),
        });
      }
      return sheet;
    });
  },

  // Version-checked lifecycle write (ADR-0011). Returns false on a lost race.
  async updateSheetIfVersion(
    id: string,
    expectedVersion: number,
    data: Prisma.TimesheetUncheckedUpdateManyInput,
  ): Promise<boolean> {
    const result = await prisma.timesheet.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...data, version: { increment: 1 } },
    });
    return result.count === 1;
  },

  lastUnlock(timesheetId: string) {
    return prisma.auditLog.findFirst({
      where: { entityType: "Timesheet", entityId: timesheetId, action: "TIMESHEET_UNLOCKED" },
      orderBy: { createdAt: "desc" },
      select: { actorId: true, createdAt: true, afterData: true },
    });
  },

  // ── Rows ──────────────────────────────────────────────────────────────────

  rows(timesheetId: string): Promise<TimesheetRowRecord[]> {
    return prisma.timesheetRow.findMany({
      where: { timesheetId, deletedAt: null },
      select: rowSelect,
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    });
  },

  findRow(id: string): Promise<TimesheetRowRecord | null> {
    return prisma.timesheetRow.findFirst({ where: { id, deletedAt: null }, select: rowSelect });
  },

  // First plain row for an issue (no tags), used when the issue page logs time.
  firstIssueRow(timesheetId: string, issueId: string) {
    return prisma.timesheetRow.findFirst({
      where: { timesheetId, issueId, deletedAt: null },
      orderBy: { position: "asc" },
      select: rowSelect,
    });
  },

  async appendRow(input: WorkItem & { timesheetId: string; actorId: string; pinnedRowId?: string | null }) {
    const last = await prisma.timesheetRow.findFirst({
      where: { timesheetId: input.timesheetId, deletedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return prisma.timesheetRow.create({
      data: {
        timesheetId: input.timesheetId,
        position: (last?.position ?? -1) + 1,
        issueId: input.issueId,
        activityId: input.activityId,
        projectId: input.projectId,
        clientId: input.clientId,
        pinnedRowId: input.pinnedRowId ?? null,
        createdBy: input.actorId,
      },
      select: rowSelect,
    });
  },

  // Inserts a copy directly below `source`, shifting the rows beneath it.
  insertBelow(source: { id: string; timesheetId: string; position: number } & WorkItem, actorId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.timesheetRow.updateMany({
        where: { timesheetId: source.timesheetId, deletedAt: null, position: { gt: source.position } },
        data: { position: { increment: 1 } },
      });
      return tx.timesheetRow.create({
        data: {
          timesheetId: source.timesheetId,
          position: source.position + 1,
          issueId: source.issueId,
          activityId: source.activityId,
          projectId: source.projectId,
          clientId: source.clientId,
          createdBy: actorId,
        },
        select: rowSelect,
      });
    });
  },

  // Rewrites a row's work item and billable override, and carries the change
  // onto its live logs in the same transaction so row and logs never disagree.
  updateRowWithLogs(
    id: string,
    expectedVersion: number,
    data: WorkItem & { billableOverride: boolean | null },
    logBillable: boolean,
    actorId: string,
  ): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const result = await tx.timesheetRow.updateMany({
        where: { id, version: expectedVersion, deletedAt: null },
        data: { ...data, version: { increment: 1 }, updatedBy: actorId },
      });
      if (result.count === 0) return false;
      await tx.workLog.updateMany({
        where: { timesheetRowId: id, deletedAt: null },
        data: {
          issueId: data.issueId,
          activityId: data.activityId,
          projectId: data.projectId,
          clientId: data.clientId,
          billable: logBillable,
          billableOverridden: data.billableOverride !== null,
          version: { increment: 1 },
          updatedBy: actorId,
        },
      });
      return true;
    });
  },

  softDeleteRowAndLogs(id: string, actorId: string) {
    const now = new Date();
    return prisma.$transaction([
      prisma.workLog.updateMany({
        where: { timesheetRowId: id, deletedAt: null },
        data: { deletedAt: now, updatedBy: actorId, version: { increment: 1 } },
      }),
      prisma.timesheetRow.update({
        where: { id },
        data: { deletedAt: now, updatedBy: actorId, version: { increment: 1 } },
      }),
    ]);
  },

  // Dense renumbering in the given order — positions never drift or tie.
  setRowOrder(orderedIds: string[], actorId: string) {
    return prisma.$transaction(
      orderedIds.map((id, index) =>
        prisma.timesheetRow.update({ where: { id }, data: { position: index, updatedBy: actorId } }),
      ),
    );
  },

  setRowPin(id: string, pinnedRowId: string | null, actorId: string) {
    return prisma.timesheetRow.update({ where: { id }, data: { pinnedRowId, updatedBy: actorId } });
  },

  markRowsReturned(rows: { rowId: string; reason: string }[], actorId: string) {
    const now = new Date();
    return prisma.$transaction(
      rows.map((r) =>
        prisma.timesheetRow.update({
          where: { id: r.rowId },
          data: { returnedAt: now, returnedById: actorId, returnedReason: r.reason, updatedBy: actorId },
        }),
      ),
    );
  },

  // ── Logs (cells) ──────────────────────────────────────────────────────────

  logs(timesheetId: string): Promise<CellLogRecord[]> {
    return prisma.workLog.findMany({
      where: { timesheetId, deletedAt: null },
      select: logSelect,
      orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
    });
  },

  cellLogs(timesheetRowId: string, workDate: Date): Promise<CellLogRecord[]> {
    return prisma.workLog.findMany({
      where: { timesheetRowId, workDate, deletedAt: null },
      select: logSelect,
    });
  },

  createLog(input: WorkItem & {
    organizationId: string;
    userId: string;
    timesheetId: string;
    timesheetRowId: string;
    workDate: Date;
    minutes: number;
    note: string | null;
    billable: boolean;
    billableOverridden: boolean;
  }): Promise<CellLogRecord> {
    return prisma.workLog.create({
      data: { ...input, createdBy: input.userId },
      select: logSelect,
    });
  },

  async updateLogIfVersion(
    id: string,
    expectedVersion: number,
    data: { minutes: number; note: string | null },
    actorId: string,
  ): Promise<CellLogRecord | null> {
    const result = await prisma.workLog.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...data, version: { increment: 1 }, updatedBy: actorId },
    });
    if (result.count === 0) return null;
    return prisma.workLog.findUnique({ where: { id }, select: logSelect });
  },

  async softDeleteLogIfVersion(id: string, expectedVersion: number, actorId: string): Promise<boolean> {
    const result = await prisma.workLog.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 }, updatedBy: actorId },
    });
    return result.count === 1;
  },

  // ── Availability (HR-synced; module 37 BR-13) ─────────────────────────────

  holidays(organizationId: string, from: Date, to: Date) {
    return prisma.holiday.findMany({
      where: { organizationId, deletedAt: null, date: { gte: from, lte: to } },
      select: { date: true, name: true },
    });
  },

  approvedLeave(userId: string, from: Date, to: Date) {
    return prisma.employeeLeave.findMany({
      where: { userId, deletedAt: null, status: "APPROVED", date: { gte: from, lte: to } },
      select: { date: true, minutes: true, type: true },
    });
  },

  // ── Pinned rows ───────────────────────────────────────────────────────────

  pinnedRows(userId: string) {
    return prisma.pinnedTimesheetRow.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        position: true,
        issueId: true,
        activityId: true,
        projectId: true,
        clientId: true,
        issue: { select: { key: true, title: true, project: { select: { name: true } } } },
        activity: { select: { name: true } },
        project: { select: { name: true } },
        client: { select: { name: true } },
      },
    });
  },

  findPinnedRow(id: string) {
    return prisma.pinnedTimesheetRow.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, userId: true, organizationId: true, position: true },
    });
  },

  async createPinnedRow(input: WorkItem & { organizationId: string; userId: string }) {
    const last = await prisma.pinnedTimesheetRow.findFirst({
      where: { userId: input.userId, deletedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return prisma.pinnedTimesheetRow.create({
      data: { ...input, position: (last?.position ?? -1) + 1, createdBy: input.userId },
      select: { id: true },
    });
  },

  // Moves a pinned row to `position` and renumbers the rest densely.
  async reorderPinnedRow(userId: string, id: string, position: number, actorId: string) {
    const all = await prisma.pinnedTimesheetRow.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    const ids = all.map((r) => r.id).filter((x) => x !== id);
    ids.splice(Math.min(position, ids.length), 0, id);
    await prisma.$transaction(
      ids.map((rowId, index) =>
        prisma.pinnedTimesheetRow.update({ where: { id: rowId }, data: { position: index, updatedBy: actorId } }),
      ),
    );
  },

  // Unpinning keeps every week's existing row (BR-19); it only stops future
  // weeks from receiving it.
  softDeletePinnedRow(id: string, actorId: string) {
    return prisma.pinnedTimesheetRow.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorId },
    });
  },

  // ── Approvals ─────────────────────────────────────────────────────────────

  approvals(timesheetId: string, round?: number) {
    return prisma.timesheetApproval.findMany({
      where: { timesheetId, ...(round === undefined ? {} : { round }) },
      orderBy: [{ round: "asc" }, { sequence: "asc" }],
      select: {
        id: true,
        round: true,
        relation: true,
        projectId: true,
        approverId: true,
        fallbackFrom: true,
        sequence: true,
        status: true,
        decidedAt: true,
        comment: true,
        approver: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  },

  isApproverOf(timesheetId: string, userId: string) {
    return prisma.timesheetApproval.count({ where: { timesheetId, approverId: userId } });
  },

  // Submit: the lifecycle write, cleared returns and the new round's slots in
  // one transaction, guarded by the sheet version.
  submit(input: {
    timesheetId: string;
    expectedVersion: number;
    round: number;
    submittedLate: boolean;
    expectedMinutes: number;
    actorId: string;
    slots: {
      relation: ApproverRelation;
      projectId: string | null;
      approverId: string;
      fallbackFrom: ApproverRelation | null;
      sequence: number;
    }[];
    autoApprove: { lock: boolean } | null;
  }): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const result = await tx.timesheet.updateMany({
        where: { id: input.timesheetId, version: input.expectedVersion, deletedAt: null },
        data: {
          status: input.autoApprove ? "APPROVED" : "SUBMITTED",
          round: input.round,
          submittedAt: now,
          submittedLate: input.submittedLate,
          expectedMinutesAtSubmit: input.expectedMinutes,
          approvedAt: input.autoApprove ? now : null,
          autoApproved: Boolean(input.autoApprove),
          lockedAt: input.autoApprove?.lock ? now : null,
          version: { increment: 1 },
          updatedBy: input.actorId,
        },
      });
      if (result.count === 0) return false;
      await tx.timesheetRow.updateMany({
        where: { timesheetId: input.timesheetId, returnedAt: { not: null } },
        data: { returnedAt: null, returnedById: null, returnedReason: null },
      });
      if (input.slots.length > 0) {
        await tx.timesheetApproval.createMany({
          data: input.slots.map((s) => ({
            ...s,
            timesheetId: input.timesheetId,
            round: input.round,
            createdBy: input.actorId,
          })),
        });
      }
      return true;
    });
  },

  // Records who actually decided: an admin may act on another admin's
  // stand-in slot, and the history must name them (ADR-0059 §6.3).
  decide(ids: string[], status: "APPROVED" | "RETURNED", comment: string | null, deciderId: string) {
    return prisma.timesheetApproval.updateMany({
      where: { id: { in: ids }, status: "PENDING" },
      data: { status, decidedAt: new Date(), comment, approverId: deciderId },
    });
  },

  skipPending(timesheetId: string, round: number) {
    return prisma.timesheetApproval.updateMany({
      where: { timesheetId, round, status: "PENDING" },
      data: { status: "SKIPPED", decidedAt: new Date() },
    });
  },

  // ── People for approver resolution (ADR-0059 §6.3) ────────────────────────

  async teamManagerOf(userId: string): Promise<string | null> {
    const membership = await prisma.teamMembership.findUnique({
      where: { userId },
      select: { team: { select: { managerId: true, deletedAt: true } } },
    });
    if (!membership || membership.team.deletedAt) return null;
    return membership.team.managerId;
  },

  async teamIdOf(userId: string): Promise<string | null> {
    const membership = await prisma.teamMembership.findUnique({
      where: { userId },
      select: { teamId: true },
    });
    return membership?.teamId ?? null;
  },

  async functionalManagerOf(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { functionalManager: { select: { id: true, isActive: true, deletedAt: true } } },
    });
    const m = user?.functionalManager;
    return m && m.isActive && !m.deletedAt ? m.id : null;
  },

  projectLeads(projectIds: string[]) {
    return prisma.projectMember.findMany({
      where: {
        projectId: { in: projectIds },
        role: "LEAD",
        deletedAt: null,
        user: { isActive: true, deletedAt: null },
      },
      select: { projectId: true, userId: true },
    });
  },

  async orgAdminIds(organizationId: string): Promise<string[]> {
    const admins = await prisma.user.findMany({
      where: { organizationId, orgRole: "ADMIN", isActive: true, deletedAt: null },
      select: { id: true },
    });
    return admins.map((a) => a.id);
  },

  userName(userId: string) {
    return prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  },

  projectNames(ids: string[]) {
    return prisma.project.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  },

  // ── Lookups for adding / editing rows ─────────────────────────────────────

  // Every default the billable chain reads for one work item (BR-10). For an
  // issue the project and client come from the issue; for an activity, from
  // its tags.
  async billableDefaults(item: WorkItem) {
    if (item.issueId) {
      const issue = await prisma.issue.findUnique({
        where: { id: item.issueId },
        select: {
          defaultBillable: true,
          project: { select: { defaultBillable: true, client: { select: { defaultBillable: true } } } },
        },
      });
      return {
        issueDefault: issue?.defaultBillable ?? null,
        activityDefault: null,
        projectDefault: issue?.project.defaultBillable ?? null,
        clientDefault: issue?.project.client?.defaultBillable ?? null,
      };
    }
    const [activity, project, client] = await Promise.all([
      item.activityId
        ? prisma.activity.findUnique({ where: { id: item.activityId }, select: { billable: true } })
        : null,
      item.projectId
        ? prisma.project.findUnique({
            where: { id: item.projectId },
            select: { defaultBillable: true, client: { select: { defaultBillable: true } } },
          })
        : null,
      item.clientId
        ? prisma.client.findUnique({ where: { id: item.clientId }, select: { defaultBillable: true } })
        : null,
    ]);
    return {
      issueDefault: null,
      activityDefault: activity?.billable ?? null,
      projectDefault: project?.defaultBillable ?? null,
      clientDefault: client?.defaultBillable ?? project?.client?.defaultBillable ?? null,
    };
  },

  issueForRow(issueId: string) {
    return prisma.issue.findFirst({
      where: { id: issueId, deletedAt: null },
      select: {
        id: true,
        projectId: true,
        project: { select: { organizationId: true, status: true, deletedAt: true } },
      },
    });
  },

  projectInOrg(projectId: string, organizationId: string) {
    return prisma.project.findFirst({
      where: { id: projectId, organizationId, deletedAt: null },
      select: { id: true },
    });
  },

  clientInOrg(clientId: string, organizationId: string) {
    return prisma.client.findFirst({
      where: { id: clientId, organizationId, deletedAt: null, archivedAt: null },
      select: { id: true },
    });
  },

  // Issues the caller can log time on (module 19 BR-1): non-archived projects
  // in their org where they are LEAD/MEMBER — or any such project for an org
  // ADMIN, who elevates to LEAD (ADR-0024).
  pickerIssues(input: {
    organizationId: string;
    userId: string;
    isAdmin: boolean;
    where: Prisma.IssueWhereInput;
    take: number;
  }) {
    return prisma.issue.findMany({
      where: {
        deletedAt: null,
        project: {
          organizationId: input.organizationId,
          deletedAt: null,
          status: { not: "ARCHIVED" },
          ...(input.isAdmin
            ? {}
            : { members: { some: { userId: input.userId, deletedAt: null, role: { in: ["LEAD", "MEMBER"] } } } }),
        },
        ...input.where,
      },
      select: { id: true, key: true, title: true, project: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: input.take,
    });
  },

  workedIssueIds(timesheetId: string) {
    return prisma.workLog.findMany({
      where: { timesheetId, deletedAt: null, issueId: { not: null } },
      distinct: ["issueId"],
      select: { issueId: true },
    });
  },
};
