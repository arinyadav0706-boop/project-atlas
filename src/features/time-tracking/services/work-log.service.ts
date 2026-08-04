import {
  WorkLogRepository,
  DEFAULT_WORKLOG_PAGE_SIZE,
  MAX_WORKLOG_PAGE_SIZE,
  type WorkLogRow,
} from "@/features/time-tracking/repositories/work-log.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import {
  ProjectService,
  type ProjectContext,
} from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";
import { elevate, canWriteContent } from "@/features/authorization/permission";
import type {
  TimeSummaryDto,
  WorkLogDto,
  WorkLogPageDto,
} from "@/features/time-tracking/types/time-tracking.types";
import type {
  CreateWorkLogInput,
  SetEstimateInput,
  UpdateWorkLogInput,
} from "@/features/time-tracking/validation/work-log.schemas";

// Business rules from docs/02_Modules/19_time_tracking.md (ADR-0030). RBAC,
// tenant scope (F-1), OCC, and audit are enforced here; Prisma lives only in
// repositories.

const canWrite = canWriteContent;

async function resolve(
  projectId: string,
  actor: Actor,
): Promise<{ context: ProjectContext; role: ProjectRoleDto | null }> {
  const context = await ProjectService.getContext(projectId);
  // F-1: a project outside the caller's org is treated as absent.
  if (!context || context.organizationId !== actor.organizationId) {
    throw new NotFoundError("Issue not found.");
  }
  const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));
  return { context, role };
}

// A DATE column comes back as midnight-UTC; render as YYYY-MM-DD, and turn an
// input YYYY-MM-DD into that same midnight-UTC instant for storage.
function toWorkDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function fromWorkDateString(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

function buildSummary(estimateMinutes: number | null, loggedMinutes: number): TimeSummaryDto {
  return {
    estimateMinutes,
    loggedMinutes,
    remainingMinutes: estimateMinutes === null ? null : estimateMinutes - loggedMinutes,
  };
}

function toDto(
  row: WorkLogRow,
  actor: Actor,
  role: ProjectRoleDto | null,
  projectStatus: ProjectContext["status"],
): WorkLogDto {
  const writable = canWrite(role) && projectStatus !== "ARCHIVED";
  const isAuthor = row.userId === actor.userId;
  return {
    id: row.id,
    issueId: row.issueId,
    minutes: row.minutes,
    workDate: toWorkDateString(row.workDate),
    note: row.note,
    user: row.user,
    createdAt: row.createdAt.toISOString(),
    version: row.version,
    // BR-3: only the author edits their own log. BR-4: author or LEAD deletes.
    canEdit: writable && isAuthor,
    canDelete: writable && (isAuthor || role === "LEAD"),
  };
}

async function recordEvent(
  organizationId: string,
  actorId: string,
  action: "WORKLOG_CREATED" | "WORKLOG_UPDATED" | "WORKLOG_DELETED" | "ISSUE_ESTIMATE_SET",
  entityId: string,
  afterData: Record<string, unknown>,
): Promise<void> {
  await AuditLogService.record({
    organizationId,
    actorId,
    action,
    entityType: action === "ISSUE_ESTIMATE_SET" ? "Issue" : "WorkLog",
    entityId,
    afterData,
  });
}

export const WorkLogService = {
  // BR-1: any org member who can see the project may read logs + the summary.
  async list(
    actor: Actor,
    issueId: string,
    page: { cursor?: string; take?: number } = {},
  ): Promise<WorkLogPageDto> {
    const issue = await IssueRepository.findProjectAndEstimate(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(issue.projectId, actor);

    const pageSize = Math.min(page.take ?? DEFAULT_WORKLOG_PAGE_SIZE, MAX_WORKLOG_PAGE_SIZE);
    const rows = await WorkLogRepository.listByIssue(issueId, { cursor: page.cursor, take: pageSize });
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? (items.at(-1)?.id ?? null) : null;
    const logged = await WorkLogRepository.sumMinutesByIssue(issueId);

    const canLog = canWrite(role) && context.status !== "ARCHIVED";
    return {
      items: items.map((r) => toDto(r, actor, role, context.status)),
      nextCursor,
      summary: buildSummary(issue.estimateMinutes, logged),
      canLog,
      canSetEstimate: canLog,
    };
  },

  // BR-1/BR-2: a MEMBER/LEAD logs time on an issue they can see.
  async create(actor: Actor, issueId: string, input: CreateWorkLogInput): Promise<WorkLogDto> {
    const issue = await IssueRepository.findProjectAndEstimate(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(issue.projectId, actor);
    if (!canWrite(role)) throw new ForbiddenError("You need to be a project member to log time.");
    if (context.status === "ARCHIVED") throw new ConflictError("Archived projects are read-only.");

    const row = await WorkLogRepository.create({
      issueId,
      userId: actor.userId,
      minutes: input.minutes,
      workDate: fromWorkDateString(input.workDate),
      note: input.note?.length ? input.note : null,
    });
    await recordEvent(context.organizationId, actor.userId, "WORKLOG_CREATED", row.id, {
      issueId,
      minutes: input.minutes,
    });
    return toDto(row, actor, role, context.status);
  },

  // BR-3: only the author may edit; OCC rejects a stale edit.
  async update(actor: Actor, workLogId: string, input: UpdateWorkLogInput): Promise<WorkLogDto> {
    const existing = await WorkLogRepository.findById(workLogId);
    if (!existing) throw new NotFoundError("Work log not found.");
    const { context, role } = await resolve(existing.issue.projectId, actor);
    if (context.status === "ARCHIVED") throw new ConflictError("Archived projects are read-only.");
    if (existing.userId !== actor.userId) {
      throw new ForbiddenError("You can only edit your own time logs.");
    }

    const row = await WorkLogRepository.updateWithVersion(
      workLogId,
      input.expectedVersion,
      {
        minutes: input.minutes,
        workDate: fromWorkDateString(input.workDate),
        note: input.note?.length ? input.note : null,
      },
      actor.userId,
    );
    if (!row) {
      throw new ConflictError(
        "This log changed since you opened it — refresh and reapply your edit.",
      );
    }
    await recordEvent(context.organizationId, actor.userId, "WORKLOG_UPDATED", row.id, {
      issueId: row.issueId,
      minutes: input.minutes,
    });
    return toDto(row, actor, role, context.status);
  },

  // BR-4: the author, or a LEAD (moderation), may delete a log.
  async delete(actor: Actor, workLogId: string): Promise<void> {
    const existing = await WorkLogRepository.findById(workLogId);
    if (!existing) throw new NotFoundError("Work log not found.");
    const { context, role } = await resolve(existing.issue.projectId, actor);
    if (context.status === "ARCHIVED") throw new ConflictError("Archived projects are read-only.");
    const allowed = canWrite(role) && (existing.userId === actor.userId || role === "LEAD");
    if (!allowed) {
      throw new ForbiddenError("Only the author or a project lead can delete this log.");
    }
    await WorkLogRepository.softDelete(workLogId, actor.userId);
    await recordEvent(context.organizationId, actor.userId, "WORKLOG_DELETED", workLogId, {
      issueId: existing.issueId,
    });
  },

  // BR-5: set or clear the issue estimate; returns the refreshed summary.
  async setEstimate(
    actor: Actor,
    issueId: string,
    input: SetEstimateInput,
  ): Promise<TimeSummaryDto> {
    const issue = await IssueRepository.findProjectAndEstimate(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(issue.projectId, actor);
    if (!canWrite(role)) throw new ForbiddenError("You need to be a project member to set the estimate.");
    if (context.status === "ARCHIVED") throw new ConflictError("Archived projects are read-only.");

    await IssueRepository.setEstimate(issueId, input.estimateMinutes, actor.userId);
    await recordEvent(context.organizationId, actor.userId, "ISSUE_ESTIMATE_SET", issueId, {
      estimateMinutes: input.estimateMinutes,
    });
    const logged = await WorkLogRepository.sumMinutesByIssue(issueId);
    return buildSummary(input.estimateMinutes, logged);
  },
};
