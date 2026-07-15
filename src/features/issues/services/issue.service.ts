import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import {
  ProjectService,
  type ProjectContext,
} from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { allowedTransitions, canTransition } from "@/features/issues/services/issue-workflow";
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
  IssuePriorityDto,
  IssueStatusDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";
import type {
  CreateIssueInput,
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
  if (!context) throw new NotFoundError("Project not found.");
  const role = await ProjectService.getMemberRole(projectId, actor.userId);
  return { context, role };
}

function toListDto(row: {
  id: string;
  key: string;
  type: IssueTypeDto;
  title: string;
  status: IssueStatusDto;
  priority: IssuePriorityDto;
  storyPoints: number | null;
  updatedAt: Date;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
}): IssueListItemDto {
  return {
    id: row.id,
    key: row.key,
    type: row.type,
    title: row.title,
    status: row.status,
    priority: row.priority,
    storyPoints: row.storyPoints,
    updatedAt: row.updatedAt.toISOString(),
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
    filters: { status?: IssueStatusDto; assigneeId?: string; type?: IssueTypeDto } = {},
  ): Promise<IssueListItemDto[]> {
    await resolve(projectId, actor); // existence check + (implicit) visibility
    const rows = await IssueRepository.listByProject(projectId, filters);
    return rows.map(toListDto);
  },

  async get(actor: Actor, issueId: string): Promise<IssueDetailDto> {
    const row = await IssueRepository.findDetail(issueId);
    if (!row) throw new NotFoundError("Issue not found.");
    const role = await ProjectService.getMemberRole(row.projectId, actor.userId);
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

    const row = await IssueRepository.update(
      issueId,
      {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assigneeId !== undefined
          ? { assignee: input.assigneeId ? { connect: { id: input.assigneeId } } : { disconnect: true } }
          : {}),
        ...(input.epicId !== undefined
          ? { epic: input.epicId ? { connect: { id: input.epicId } } : { disconnect: true } }
          : {}),
        ...(input.storyPoints !== undefined ? { storyPoints: input.storyPoints } : {}),
        ...(input.dueDate !== undefined
          ? { dueDate: input.dueDate ? new Date(input.dueDate) : null }
          : {}),
      },
      actor.userId,
    );
    return toDetailDto(row, actor, role);
  },

  // BR-5 (fixed workflow) + BR-6 (audit the transition for cycle-time).
  async transition(
    actor: Actor,
    issueId: string,
    to: IssueStatusDto,
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

    const row = await IssueRepository.setStatus(issueId, to, actor.userId);
    await AuditLogService.record({
      organizationId: context.organizationId,
      actorId: actor.userId,
      action: "ISSUE_STATUS_CHANGED",
      entityType: "Issue",
      entityId: issueId,
      beforeData: { status: existing.status },
      afterData: { status: to },
    });
    return toDetailDto(row, actor, role);
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
