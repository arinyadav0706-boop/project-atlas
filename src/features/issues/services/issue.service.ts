import {
  IssueRepository,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@/features/issues/repositories/issue.repository";
import {
  ProjectService,
  type ProjectContext,
} from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { allowedTransitions, canTransition } from "@/features/issues/services/issue-workflow";
import { rankBetween } from "@/shared/lib/rank";
import { RecentItemService } from "@/features/home/services/recent-item.service";
import { NotificationService } from "@/features/notifications/services/notification.service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type {
  IssueDetailDto,
  IssueListItemDto,
  IssueListPageDto,
  IssuePriorityDto,
  IssueStatusCounts,
  IssueStatusDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";
import type {
  CreateIssueInput,
  ReorderIssueInput,
  UpdateIssueInput,
} from "@/features/issues/validation/issue.schemas";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";

// Business rules from docs/02_Modules/04_issues.md. RBAC + the fixed
// workflow are enforced here, server-side, per the actor's project role.

type IssueRow = NonNullable<Awaited<ReturnType<typeof IssueRepository.findDetail>>>;

function canWrite(role: ProjectRoleDto | null): boolean {
  return role === "MEMBER" || role === "LEAD";
}

async function resolve(
  projectId: string,
  actor: Actor,
): Promise<{ context: ProjectContext; role: ProjectRoleDto | null }> {
  const context = await ProjectService.getContext(projectId);
  // Tenant scope (F-1): a project outside the caller's org is treated as
  // absent — never reveal existence or content across organizations.
  if (!context || context.organizationId !== actor.organizationId) {
    throw new NotFoundError("Project not found.");
  }
  const role = await ProjectService.getMemberRole(projectId, actor.userId);
  return { context, role };
}

function toListDto(row: {
  id: string;
  projectId: string;
  key: string;
  type: IssueTypeDto;
  title: string;
  status: IssueStatusDto;
  priority: IssuePriorityDto;
  storyPoints: number | null;
  updatedAt: Date;
  version: number;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
}): IssueListItemDto {
  return {
    id: row.id,
    projectId: row.projectId,
    key: row.key,
    type: row.type,
    title: row.title,
    status: row.status,
    priority: row.priority,
    storyPoints: row.storyPoints,
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    assignee: row.assignee,
  };
}

function toDetailDto(row: IssueRow, actor: Actor, role: ProjectRoleDto | null): IssueDetailDto {
  const canDelete =
    role === "LEAD" || row.reporterId === actor.userId || row.assigneeId === actor.userId;
  return {
    ...toListDto(row),
    description: row.description,
    reporter: row.reporter,
    epicId: row.epicId,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    canEdit: canWrite(role),
    canDelete: canWrite(role) && canDelete,
    allowedStatuses: [row.status, ...allowedTransitions(row.status)],
  };
}

// Assignee (if set) must be a member of the same project (BR-3).
async function validateAssignee(
  projectId: string,
  assigneeId: string | null | undefined,
): Promise<void> {
  if (!assigneeId) return;
  const role = await ProjectService.getMemberRole(projectId, assigneeId);
  if (!role) {
    throw new ValidationError("Assignee must be a member of this project.");
  }
}

// Epic (if set) must be an EPIC-type issue in the same project (BR-4).
async function validateEpic(
  projectId: string,
  epicId: string | null | undefined,
): Promise<void> {
  if (!epicId) return;
  const epic = await IssueRepository.findEpic(projectId, epicId);
  if (!epic) {
    throw new ValidationError("Parent epic must be an Epic in this project.");
  }
}

export const IssueService = {
  async list(
    actor: Actor,
    projectId: string,
    options: {
      status?: IssueStatusDto;
      assigneeId?: string;
      type?: IssueTypeDto;
      cursor?: string;
      take?: number;
    } = {},
  ): Promise<IssueListPageDto> {
    await resolve(projectId, actor); // existence check + (implicit) visibility
    const { status, assigneeId, type, cursor, take } = options;
    const pageSize = Math.min(take ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    // Page and counts are independent — fetch them together.
    const [rows, grouped] = await Promise.all([
      IssueRepository.listByProject(
        projectId,
        { status, assigneeId, type },
        { cursor, take: pageSize },
      ),
      IssueRepository.countByStatus(projectId, { assigneeId, type }),
    ]);

    // listByProject fetches pageSize + 1 to detect a further page.
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? (items.at(-1)?.id ?? null) : null;

    const counts: IssueStatusCounts = {
      ALL: 0,
      TODO: 0,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      DONE: 0,
    };
    for (const row of grouped) {
      counts[row.status] = row._count._all;
      counts.ALL += row._count._all;
    }

    return { items: items.map(toListDto), nextCursor, counts };
  },

  async get(actor: Actor, issueId: string): Promise<IssueDetailDto> {
    const row = await IssueRepository.findDetail(issueId);
    if (!row) throw new NotFoundError("Issue not found.");
    // resolve() enforces the tenant scope (F-1) and yields the caller's role.
    const { role } = await resolve(row.projectId, actor);
    // Best-effort engagement signal for Home's "Continue working" (ADR-0012).
    await RecentItemService.record(actor, "ISSUE", issueId, "VIEWED");
    return toDetailDto(row, actor, role);
  },

  async create(
    actor: Actor,
    projectId: string,
    input: CreateIssueInput,
  ): Promise<IssueDetailDto> {
    const { context, role } = await resolve(projectId, actor);
    if (!canWrite(role)) {
      throw new ForbiddenError("You need to be a project member to create issues.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    await validateAssignee(projectId, input.assigneeId);
    await validateEpic(projectId, input.epicId);

    const row = await IssueRepository.createWithKey({
      projectId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      assigneeId: input.assigneeId ?? null,
      reporterId: actor.userId,
      epicId: input.epicId ?? null,
      storyPoints: input.storyPoints ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      creatorId: actor.userId,
    });
    await RecentItemService.record(actor, "ISSUE", row.id, "EDITED");
    // Notify the assignee if the issue was created already assigned (ADR-0019).
    await NotificationService.issueAssigned(actor, {
      issueId: row.id,
      issueKey: row.key,
      issueTitle: row.title,
      assigneeId: row.assigneeId,
    });
    return toDetailDto(row, actor, role);
  },

  async update(
    actor: Actor,
    issueId: string,
    input: UpdateIssueInput,
  ): Promise<IssueDetailDto> {
    const existing = await IssueRepository.findDetail(issueId);
    if (!existing) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(existing.projectId, actor);
    if (!canWrite(role)) {
      throw new ForbiddenError("You need to be a project member to edit issues.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    if (input.assigneeId !== undefined) {
      await validateAssignee(existing.projectId, input.assigneeId);
    }
    if (input.epicId !== undefined) {
      await validateEpic(existing.projectId, input.epicId);
    }

    // Optimistic concurrency (ADR-0011): scalar FKs (assigneeId/epicId) are set
    // directly rather than via relation connect/disconnect, because the
    // version-checked write uses updateMany (which sets only scalar columns).
    const row = await IssueRepository.updateWithVersion(
      issueId,
      input.expectedVersion,
      {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(input.epicId !== undefined ? { epicId: input.epicId } : {}),
        ...(input.storyPoints !== undefined ? { storyPoints: input.storyPoints } : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
          : {}),
      },
      actor.userId,
    );
    if (!row) {
      throw new ConflictError(
        "This issue was changed by someone else — refresh to see the latest, then reapply your edit.",
      );
    }
    await RecentItemService.record(actor, "ISSUE", issueId, "EDITED");
    // Notify a newly-assigned user (reassignment to someone else — ADR-0019).
    if (
      input.assigneeId !== undefined &&
      input.assigneeId &&
      input.assigneeId !== existing.assigneeId
    ) {
      await NotificationService.issueAssigned(actor, {
        issueId,
        issueKey: row.key,
        issueTitle: row.title,
        assigneeId: input.assigneeId,
      });
    }
    return toDetailDto(row, actor, role);
  },

  // BR-5 (fixed workflow) + BR-6 (audit the transition for cycle-time).
  async transition(
    actor: Actor,
    issueId: string,
    to: IssueStatusDto,
    expectedVersion: number,
  ): Promise<IssueDetailDto> {
    const existing = await IssueRepository.findDetail(issueId);
    if (!existing) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(existing.projectId, actor);
    if (!canWrite(role)) {
      throw new ForbiddenError("You need to be a project member to change status.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    if (!canTransition(existing.status, to)) {
      throw new ValidationError(
        `Cannot move from ${existing.status} to ${to} — it must pass through the workflow in order.`,
      );
    }
    if (existing.status === to) {
      return toDetailDto(existing, actor, role);
    }

    // Optimistic concurrency (ADR-0011): reject if the issue changed since read.
    const row = await IssueRepository.setStatusWithVersion(
      issueId,
      expectedVersion,
      to,
      actor.userId,
    );
    if (!row) {
      throw new ConflictError(
        "This issue was changed by someone else — refresh and try the status change again.",
      );
    }
    await RecentItemService.record(actor, "ISSUE", issueId, "TRANSITIONED");
    await AuditLogService.record({
      organizationId: context.organizationId,
      actorId: actor.userId,
      action: "ISSUE_STATUS_CHANGED",
      entityType: "Issue",
      entityId: issueId,
      beforeData: { status: existing.status },
      afterData: { status: to },
    });
    // Notify the assignee + reporter of the status change (ADR-0019).
    await NotificationService.issueStatusChanged(actor, {
      issueId,
      issueKey: existing.key,
      status: to,
      recipientIds: [existing.assigneeId, existing.reporterId],
    });
    return toDetailDto(row, actor, role);
  },

  // Board/Backlog reorder (05_board.md BR-3/BR-4, 06_backlog.md, ADR-0009,
  // ADR-0013). One `rank` per issue; the `scope` selects which view's neighbours
  // to validate against, so the same endpoint serves both without a rank column
  // per view. A single-row write, guarded by optimistic concurrency.
  async reorder(
    actor: Actor,
    issueId: string,
    input: ReorderIssueInput,
  ): Promise<IssueDetailDto> {
    const existing = await IssueRepository.findDetail(issueId);
    if (!existing) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(existing.projectId, actor);
    if (!canWrite(role)) {
      throw new ForbiddenError("You need to be a project member to reorder issues.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    // A card cannot be positioned relative to itself.
    if (input.beforeId === issueId || input.afterId === issueId) {
      throw new ValidationError("A card cannot be positioned relative to itself.");
    }

    return input.scope === "backlog"
      ? this.reorderInBacklog(actor, existing, role, input)
      : this.reorderOnBoard(actor, context, existing, role, input);
  },

  // Board reorder: neighbours must share the DESTINATION column; an optional
  // `status` combines a column move with the reorder (BR-3/BR-4, ADR-0009).
  async reorderOnBoard(
    actor: Actor,
    context: ProjectContext,
    existing: IssueRow,
    role: ProjectRoleDto | null,
    input: ReorderIssueInput,
  ): Promise<IssueDetailDto> {
    const destStatus = input.status ?? existing.status;
    const statusChanged = destStatus !== existing.status;
    // A column move runs the same workflow check as any transition (BR-3).
    if (statusChanged && !canTransition(existing.status, destStatus)) {
      throw new ValidationError(
        `Cannot move from ${existing.status} to ${destStatus} — it must pass through the workflow in order.`,
      );
    }

    // Neighbours must be non-deleted issues in the SAME project and the
    // DESTINATION column — validated here, never trusted from the client (BR-4).
    const [before, after] = await Promise.all([
      input.beforeId
        ? IssueRepository.findRankInColumn(input.beforeId, existing.projectId, destStatus)
        : Promise.resolve(null),
      input.afterId
        ? IssueRepository.findRankInColumn(input.afterId, existing.projectId, destStatus)
        : Promise.resolve(null),
    ]);
    if (input.beforeId && !before) {
      throw new ConflictError("The card you dropped after is no longer in that column — refresh and retry.");
    }
    if (input.afterId && !after) {
      throw new ConflictError("The card you dropped before is no longer in that column — refresh and retry.");
    }

    const rank = this.rankOrConflict(before?.rank ?? null, after?.rank ?? null, actor.userId);

    // Optimistic concurrency (ADR-0011): applies only if the card is still at
    // the version the client dragged from; otherwise it's a lost update.
    const row = await IssueRepository.reorderWithVersion(
      existing.id,
      input.expectedVersion,
      { rank, status: statusChanged ? destStatus : undefined },
      actor.userId,
    );
    if (!row) {
      throw new ConflictError(
        "This card was changed by someone else — refresh the board and try the move again.",
      );
    }
    if (statusChanged) {
      await AuditLogService.record({
        organizationId: context.organizationId,
        actorId: actor.userId,
        action: "ISSUE_STATUS_CHANGED",
        entityType: "Issue",
        entityId: existing.id,
        beforeData: { status: existing.status },
        afterData: { status: destStatus },
      });
    }
    return toDetailDto(row, actor, role);
  },

  // Backlog reorder (ADR-0013): a single flat list of unscheduled issues across
  // all statuses. Neighbours are validated against the backlog, not a column;
  // status is never changed here (a backlog drag only reprioritises).
  async reorderInBacklog(
    actor: Actor,
    existing: IssueRow,
    role: ProjectRoleDto | null,
    input: ReorderIssueInput,
  ): Promise<IssueDetailDto> {
    if (input.status && input.status !== existing.status) {
      throw new ValidationError("Backlog reordering cannot change an issue's status.");
    }
    // The issue itself must be in the backlog to be reordered within it.
    if (existing.sprintId !== null) {
      throw new ConflictError("This issue is in a sprint, not the backlog — refresh and retry.");
    }

    // Neighbours must be non-deleted, unscheduled issues in the SAME project.
    const [before, after] = await Promise.all([
      input.beforeId
        ? IssueRepository.findRankInBacklog(input.beforeId, existing.projectId)
        : Promise.resolve(null),
      input.afterId
        ? IssueRepository.findRankInBacklog(input.afterId, existing.projectId)
        : Promise.resolve(null),
    ]);
    if (input.beforeId && !before) {
      throw new ConflictError("The item you dropped after is no longer in the backlog — refresh and retry.");
    }
    if (input.afterId && !after) {
      throw new ConflictError("The item you dropped before is no longer in the backlog — refresh and retry.");
    }

    const rank = this.rankOrConflict(before?.rank ?? null, after?.rank ?? null, actor.userId);

    const row = await IssueRepository.reorderWithVersion(
      existing.id,
      input.expectedVersion,
      { rank },
      actor.userId,
    );
    if (!row) {
      throw new ConflictError(
        "This item was changed by someone else — refresh the backlog and try the move again.",
      );
    }
    return toDetailDto(row, actor, role);
  },

  // Rank between two neighbours, or a ConflictError if they're out of order
  // (a stale client view / lost race) — shared by both reorder scopes.
  rankOrConflict(before: string | null, after: string | null, actorId: string): string {
    try {
      return rankBetween(before, after, actorId);
    } catch {
      throw new ConflictError("The list changed — refresh and try the move again.");
    }
  },

  // BR-2: LEAD, or the issue's reporter/assignee, may delete.
  async delete(actor: Actor, issueId: string): Promise<void> {
    const existing = await IssueRepository.findDetail(issueId);
    if (!existing) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(existing.projectId, actor);
    const allowed =
      role === "LEAD" ||
      existing.reporterId === actor.userId ||
      existing.assigneeId === actor.userId;
    if (!canWrite(role) || !allowed) {
      throw new ForbiddenError("Only a lead or the issue's reporter/assignee can delete it.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    await IssueRepository.softDelete(issueId, actor.userId);
  },
};
