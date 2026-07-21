import { SprintRepository } from "@/features/sprints/repositories/sprint.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import {
  ProjectService,
  type ProjectContext,
} from "@/features/projects/services/project.service";
import { rankBetween } from "@/shared/lib/rank";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";
import type {
  CreateSprintInput,
  MoveIssueToSprintInput,
  UpdateSprintInput,
} from "@/features/sprints/validation/sprint.schemas";
import type {
  SprintDto,
  SprintPanelDto,
  SprintProgressDto,
  SprintWithProgressDto,
} from "@/features/sprints/types/sprint.types";

// Business rules from docs/02_Modules/07_sprint.md. RBAC (BR-4) and the sprint
// lifecycle are enforced here, server-side. Prisma lives only in repositories.

type SprintRow = Awaited<ReturnType<typeof SprintRepository.findById>>;

function canWrite(role: ProjectRoleDto | null): boolean {
  return role === "MEMBER" || role === "LEAD";
}

// Only a LEAD manages the sprint lifecycle (create/edit/start/complete, BR-4).
function canManage(role: ProjectRoleDto | null): boolean {
  return role === "LEAD";
}

async function resolve(
  projectId: string,
  actor: Actor,
): Promise<{ context: ProjectContext; role: ProjectRoleDto | null }> {
  const context = await ProjectService.getContext(projectId);
  // Tenant scope (F-1): a project outside the caller's org is treated as absent.
  if (!context || context.organizationId !== actor.organizationId) {
    throw new NotFoundError("Project not found.");
  }
  const role = await ProjectService.getMemberRole(projectId, actor.userId);
  return { context, role };
}

function toDto(row: NonNullable<SprintRow>): SprintDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    goal: row.goal,
    status: row.status,
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
  };
}

async function withProgress(
  row: NonNullable<SprintRow>,
  role: ProjectRoleDto | null,
): Promise<SprintWithProgressDto> {
  const grouped = await SprintRepository.progressByStatus(row.id);
  const progress: SprintProgressDto = {
    totalIssues: 0,
    doneIssues: 0,
    totalStoryPoints: 0,
    doneStoryPoints: 0,
  };
  for (const g of grouped) {
    const count = g._count._all;
    const points = g._sum.storyPoints ?? 0;
    progress.totalIssues += count;
    progress.totalStoryPoints += points;
    if (g.status === "DONE") {
      progress.doneIssues += count;
      progress.doneStoryPoints += points;
    }
  }
  return { ...toDto(row), progress, canManage: canManage(role) };
}

// Load a sprint, enforce tenant scope via its project, and yield the caller's
// role — the common prelude for every sprint mutation.
async function loadSprint(
  sprintId: string,
  actor: Actor,
): Promise<{
  sprint: NonNullable<SprintRow>;
  context: ProjectContext;
  role: ProjectRoleDto | null;
}> {
  const sprint = await SprintRepository.findById(sprintId);
  if (!sprint) throw new NotFoundError("Sprint not found.");
  const { context, role } = await resolve(sprint.projectId, actor);
  return { sprint, context, role };
}

export const SprintService = {
  async list(actor: Actor, projectId: string): Promise<SprintWithProgressDto[]> {
    const { role } = await resolve(projectId, actor);
    const sprints = await SprintRepository.listByProject(projectId);
    return Promise.all(sprints.map((s) => withProgress(s, role)));
  },

  // The Backlog page's current sprint (ACTIVE, else next PLANNED) with progress.
  async getCurrent(
    actor: Actor,
    projectId: string,
  ): Promise<SprintWithProgressDto | null> {
    const { role } = await resolve(projectId, actor);
    const current = await SprintRepository.findCurrent(projectId);
    return current ? withProgress(current, role) : null;
  },

  // The Backlog page's Sprint section (ADR-0014): the current sprint (if any),
  // its rank-ordered issues, and whether the viewer may drag (MEMBER/LEAD).
  async getPanel(actor: Actor, projectId: string): Promise<SprintPanelDto> {
    const { role } = await resolve(projectId, actor);
    const current = await SprintRepository.findCurrent(projectId);
    if (!current) {
      return { sprint: null, items: [], canWrite: canWrite(role) };
    }
    const [sprint, rows] = await Promise.all([
      withProgress(current, role),
      SprintRepository.listSprintIssues(projectId, current.id),
    ]);
    return { sprint, items: rows.map(toCardDto), canWrite: canWrite(role) };
  },

  async create(
    actor: Actor,
    projectId: string,
    input: CreateSprintInput,
  ): Promise<SprintWithProgressDto> {
    const { context, role } = await resolve(projectId, actor);
    if (!canManage(role)) {
      throw new ForbiddenError("Only a project lead can create sprints.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    const row = await SprintRepository.create({
      projectId,
      name: input.name,
      goal: input.goal ?? null,
      actorId: actor.userId,
    });
    return withProgress(row, role);
  },

  async update(
    actor: Actor,
    sprintId: string,
    input: UpdateSprintInput,
  ): Promise<SprintWithProgressDto> {
    const { sprint, context, role } = await loadSprint(sprintId, actor);
    if (!canManage(role)) {
      throw new ForbiddenError("Only a project lead can edit sprints.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    if (sprint.status === "COMPLETED") {
      throw new ConflictError("A completed sprint is read-only.");
    }

    // Cross-field check (BR-2): compare the effective start/end after the edit,
    // whether each is being changed or kept.
    const nextStart =
      input.startDate !== undefined
        ? input.startDate
          ? new Date(input.startDate)
          : null
        : sprint.startDate;
    const nextEnd =
      input.endDate !== undefined
        ? input.endDate
          ? new Date(input.endDate)
          : null
        : sprint.endDate;
    if (nextStart && nextEnd && nextEnd <= nextStart) {
      throw new ValidationError("End date must be after the start date.");
    }

    const row = await SprintRepository.update(
      sprintId,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.goal !== undefined ? { goal: input.goal } : {}),
        ...(input.startDate !== undefined
          ? { startDate: input.startDate ? new Date(input.startDate) : null }
          : {}),
        ...(input.endDate !== undefined
          ? { endDate: input.endDate ? new Date(input.endDate) : null }
          : {}),
      },
      actor.userId,
    );
    return withProgress(row, role);
  },

  // BR-1 (one ACTIVE per project, transactional) + BR-2 (dates required).
  async start(actor: Actor, sprintId: string): Promise<SprintWithProgressDto> {
    const { sprint, context, role } = await loadSprint(sprintId, actor);
    if (!canManage(role)) {
      throw new ForbiddenError("Only a project lead can start a sprint.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    if (sprint.status !== "PLANNED") {
      throw new ConflictError("Only a planned sprint can be started.");
    }
    if (!sprint.startDate || !sprint.endDate) {
      throw new ValidationError("Set a start and end date before starting the sprint.");
    }
    if (sprint.endDate <= sprint.startDate) {
      throw new ValidationError("End date must be after the start date.");
    }

    const result = await SprintRepository.start(sprintId, sprint.projectId, actor.userId);
    if (!result.ok) {
      throw new ConflictError(
        "Another sprint is already active for this project — complete it first.",
      );
    }
    return withProgress(result.sprint, role);
  },

  // BR-3: complete an ACTIVE sprint; incomplete issues return to the backlog.
  async complete(
    actor: Actor,
    sprintId: string,
  ): Promise<SprintWithProgressDto> {
    const { sprint, context, role } = await loadSprint(sprintId, actor);
    if (!canManage(role)) {
      throw new ForbiddenError("Only a project lead can complete a sprint.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    if (sprint.status !== "ACTIVE") {
      throw new ConflictError("Only an active sprint can be completed.");
    }
    const { sprint: row } = await SprintRepository.complete(
      sprintId,
      sprint.projectId,
      actor.userId,
    );
    return withProgress(row, role);
  },

  // BR-6 (ADR-0014): move an issue to a sprint or back to the backlog, positioned
  // between its dropped neighbours — one atomic sprintId + rank write, OCC-guarded.
  async moveIssue(
    actor: Actor,
    issueId: string,
    input: MoveIssueToSprintInput,
  ): Promise<IssueListItemDto> {
    const existing = await IssueRepository.findDetail(issueId);
    if (!existing) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(existing.projectId, actor);
    if (!canWrite(role)) {
      throw new ForbiddenError("You need to be a project member to move issues.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    if (input.beforeId === issueId || input.afterId === issueId) {
      throw new ValidationError("An issue cannot be positioned relative to itself.");
    }

    // BR-5: an issue cannot leave a COMPLETED sprint...
    if (existing.sprintId) {
      const sourceStatus = await SprintRepository.statusOf(existing.sprintId);
      if (sourceStatus === "COMPLETED") {
        throw new ConflictError("A completed sprint is frozen — its issues cannot be moved.");
      }
    }

    // ...nor enter one; the target must also be a same-project, non-completed sprint.
    if (input.sprintId) {
      const target = await SprintRepository.findById(input.sprintId);
      if (!target || target.projectId !== existing.projectId) {
        throw new NotFoundError("Sprint not found.");
      }
      if (target.status === "COMPLETED") {
        throw new ConflictError("A completed sprint is frozen — issues cannot be added to it.");
      }
    }

    // Neighbours must be non-deleted issues in the SAME project and the
    // DESTINATION list (the target sprint, or the backlog when sprintId is null).
    const lookup = (id: string) =>
      input.sprintId
        ? IssueRepository.findRankInSprint(id, existing.projectId, input.sprintId)
        : IssueRepository.findRankInBacklog(id, existing.projectId);
    const [before, after] = await Promise.all([
      input.beforeId ? lookup(input.beforeId) : Promise.resolve(null),
      input.afterId ? lookup(input.afterId) : Promise.resolve(null),
    ]);
    if (input.beforeId && !before) {
      throw new ConflictError("The item you dropped after is no longer there — refresh and retry.");
    }
    if (input.afterId && !after) {
      throw new ConflictError("The item you dropped before is no longer there — refresh and retry.");
    }

    let rank: string;
    try {
      rank = rankBetween(before?.rank ?? null, after?.rank ?? null, actor.userId);
    } catch {
      throw new ConflictError("The list changed — refresh and try the move again.");
    }

    const row = await IssueRepository.moveToSprintWithVersion(
      issueId,
      input.expectedVersion,
      { sprintId: input.sprintId, rank },
      actor.userId,
    );
    if (!row) {
      throw new ConflictError(
        "This issue was changed by someone else — refresh and try the move again.",
      );
    }
    // The drag only needs the repositioned card back (esp. the fresh `version`
    // for the next drag) — the same list-level shape the reorder endpoint uses.
    return toCardDto(row);
  },
};

// Accepts any row carrying the list-level fields (the detail row from a move, or
// the leaner card row from the sprint panel) — both satisfy this shape.
function toCardDto(row: {
  id: string;
  projectId: string;
  key: string;
  type: IssueListItemDto["type"];
  title: string;
  status: IssueListItemDto["status"];
  priority: IssueListItemDto["priority"];
  storyPoints: number | null;
  updatedAt: Date;
  version: number;
  assignee: IssueListItemDto["assignee"];
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
