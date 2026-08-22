import type { Actor } from "@/shared/types/actor";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import { canManageProject, canWriteContent, elevate } from "@/features/authorization/permission";
import { ProjectService } from "@/features/projects/services/project.service";
import { WorkflowRepository } from "@/features/workflow/repositories/workflow.repository";
import { MAX_STATUSES_PER_PROJECT } from "@/features/workflow/validation/workflow.schemas";
import type {
  CreateStatusInput,
  DeleteStatusInput,
  ReorderStatusesInput,
  TransitionsInput,
  UpdateStatusInput,
} from "@/features/workflow/validation/workflow.schemas";
import type {
  StatusCategoryDto,
  WorkflowDto,
  WorkflowStatusDto,
} from "@/features/workflow/types/workflow.types";

// Business rules: docs/02_Modules/30_workflow.md (ADR-0049).
//
// Reading a project's statuses needs only that you can see the project;
// changing them is LEAD, or an org ADMIN elevated to one (BR-9). Enforced here,
// server-side, never in the editor — the editor only decides what to draw.

export const WorkflowService = {
  /** Statuses, transitions and the enforcement flag — one response. */
  async get(actor: Actor, projectId: string): Promise<WorkflowDto> {
    const { context, role } = await this.resolve(projectId, actor);
    const [statuses, transitions] = await Promise.all([
      WorkflowRepository.listWithCounts(projectId),
      WorkflowRepository.listTransitions(projectId),
    ]);
    return {
      statuses,
      transitions,
      enforceTransitions: context.enforceTransitions,
      canManage: canManageProject(role),
    };
  },

  /** Just the statuses, for anything that renders them (the board, a picker). */
  async listStatuses(actor: Actor, projectId: string): Promise<WorkflowStatusDto[]> {
    await this.resolve(projectId, actor);
    return WorkflowRepository.list(projectId);
  },

  async create(
    actor: Actor,
    projectId: string,
    input: CreateStatusInput,
  ): Promise<WorkflowStatusDto> {
    const { context } = await this.requireManage(projectId, actor);

    const existing = await WorkflowRepository.list(projectId);
    if (existing.length >= MAX_STATUSES_PER_PROJECT) {
      throw new ConflictError(
        `A project can have at most ${MAX_STATUSES_PER_PROJECT} statuses. Delete one first.`,
      );
    }
    const clash = await WorkflowRepository.findByName(projectId, input.name);
    if (clash) {
      throw new ConflictError(`This project already has a status called "${clash.name}".`);
    }

    return WorkflowRepository.create({
      organizationId: context.organizationId,
      projectId,
      name: input.name,
      category: input.category,
      color: input.color,
      position: await WorkflowRepository.nextPosition(projectId),
      actorId: actor.userId,
    });
  },

  async update(
    actor: Actor,
    projectId: string,
    statusId: string,
    input: UpdateStatusInput,
  ): Promise<WorkflowStatusDto> {
    await this.requireManage(projectId, actor);
    const status = await this.requireStatus(projectId, statusId);

    if (input.name && input.name.toLowerCase() !== status.name.toLowerCase()) {
      const clash = await WorkflowRepository.findByName(projectId, input.name);
      if (clash && clash.id !== statusId) {
        throw new ConflictError(`This project already has a status called "${clash.name}".`);
      }
    }

    // Moving the default is its own operation: it has to clear the old flag in
    // the same transaction, or a project ends up with two defaults or none.
    if (input.isDefault) {
      await WorkflowRepository.setDefault(projectId, statusId, actor.userId);
    }

    const fields = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
    };
    if (Object.keys(fields).length === 0) {
      return this.requireStatus(projectId, statusId);
    }
    // Changing the category rewrites the cached category on every issue sitting
    // on this status (BR-2) — the repository does both in one transaction,
    // because an issue whose category disagrees with its status is invisible to
    // half the product's queries.
    return WorkflowRepository.update(statusId, fields, actor.userId);
  },

  async remove(
    actor: Actor,
    projectId: string,
    statusId: string,
    input: DeleteStatusInput,
  ): Promise<{ movedIssues: number }> {
    await this.requireManage(projectId, actor);
    const status = await this.requireStatus(projectId, statusId);
    const replacement = await this.requireStatus(projectId, input.replacementId);

    if (replacement.id === status.id) {
      throw new ConflictError("Pick a different status for its issues to move to.");
    }
    if (status.isDefault) {
      throw new ConflictError(
        `"${status.name}" is where new issues start. Make another status the default first.`,
      );
    }
    // BR-6: a replacement in another category would silently change what "done"
    // means for that work — those issues would leave or enter reports, the
    // workload and the dependency guard, and nobody asked for that.
    if (replacement.category !== status.category) {
      throw new ConflictError(
        `"${replacement.name}" is a different kind of status, so moving work there would change whether it counts as finished. Pick another ${status.category === "DONE" ? "done" : "open"} status.`,
      );
    }
    const all = await WorkflowRepository.list(projectId);
    if (all.filter((s) => s.category === status.category).length <= 1) {
      throw new ConflictError(
        `"${status.name}" is the only status of its kind. Add another one before deleting it.`,
      );
    }

    const movedIssues = await WorkflowRepository.deleteWithReassign(
      statusId,
      replacement.id,
      replacement.category,
      actor.userId,
    );
    return { movedIssues };
  },

  async reorder(
    actor: Actor,
    projectId: string,
    input: ReorderStatusesInput,
  ): Promise<WorkflowStatusDto[]> {
    await this.requireManage(projectId, actor);
    const all = await WorkflowRepository.list(projectId);

    // The list must be the WHOLE list (BR-8). A partial one would silently
    // renumber some statuses and leave others at stale positions, which reads
    // as the board shuffling itself.
    const known = new Set(all.map((s) => s.id));
    const given = new Set(input.statusIds);
    if (given.size !== input.statusIds.length) {
      throw new ConflictError("That order lists the same status twice.");
    }
    if (given.size !== known.size || input.statusIds.some((id) => !known.has(id))) {
      throw new ConflictError(
        "The order has to list every status in the project exactly once — refresh and try again.",
      );
    }

    await WorkflowRepository.reorder(projectId, input.statusIds, actor.userId);
    return WorkflowRepository.list(projectId);
  },

  async setTransitions(
    actor: Actor,
    projectId: string,
    input: TransitionsInput,
  ): Promise<WorkflowDto> {
    await this.requireManage(projectId, actor);
    const all = await WorkflowRepository.list(projectId);
    const known = new Set(all.map((s) => s.id));

    for (const t of input.transitions) {
      if (!known.has(t.fromStatusId) || !known.has(t.toStatusId)) {
        throw new ConflictError("That rule points at a status this project doesn't have.");
      }
    }
    // Turning enforcement on with nothing allowed would freeze every issue where
    // it stands, and the person doing it would find out from a colleague.
    if (input.enforce && input.transitions.length === 0) {
      throw new ConflictError(
        "Allow at least one move before restricting transitions, or nothing could ever change status.",
      );
    }

    await WorkflowRepository.replaceTransitions(
      projectId,
      input.enforce,
      input.transitions,
      actor.userId,
    );
    return this.get(actor, projectId);
  },

  /**
   * The guard every status change goes through (BR-10).
   *
   * Returns silently when the move is allowed. When it is not, the message
   * names what IS reachable — "no" without "instead, these" is the single most
   * disliked thing about Jira's workflow engine, and it costs one query.
   */
  async assertTransitionAllowed(
    projectId: string,
    fromStatusId: string,
    toStatusId: string,
  ): Promise<void> {
    if (fromStatusId === toStatusId) return;
    const context = await ProjectService.getContext(projectId);
    if (!context?.enforceTransitions) return;

    const allowed = await WorkflowRepository.isTransitionAllowed(fromStatusId, toStatusId);
    if (allowed) return;

    const reachable = await WorkflowRepository.reachableFrom(fromStatusId);
    const names = reachable.map((r) => r.toStatus.name);
    throw new ConflictError(
      names.length > 0
        ? `This project restricts status changes. From here you can move to: ${names.join(", ")}.`
        : "This project restricts status changes, and nothing is allowed from this status. Ask a project lead to add a transition.",
    );
  },

  /**
   * Where an issue on `fromStatusId` may move to, including where it already is.
   *
   * Unrestricted projects get every status the project has — the ClickUp,
   * Asana and Jira-default answer. Restricted ones get the current status plus
   * whatever transitions allow, so a picker can only ever offer moves the
   * server will accept: an option that errors on click is worse than an option
   * that is not there.
   */
  async reachableStatuses(
    projectId: string,
    fromStatusId: string,
  ): Promise<WorkflowStatusDto[]> {
    const [all, context] = await Promise.all([
      WorkflowRepository.list(projectId),
      ProjectService.getContext(projectId),
    ]);
    if (!context?.enforceTransitions) return all;

    const transitions = await WorkflowRepository.listTransitions(projectId);
    const allowed = new Set(
      transitions.filter((t) => t.fromStatusId === fromStatusId).map((t) => t.toStatusId),
    );
    return all.filter((s) => s.id === fromStatusId || allowed.has(s.id));
  },

  /** A status belonging to this project, or a 404. */
  async requireStatus(projectId: string, statusId: string): Promise<WorkflowStatusDto> {
    const status = await WorkflowRepository.findById(statusId);
    if (!status || status.projectId !== projectId) {
      throw new NotFoundError("Status not found.");
    }
    return status;
  },

  /** Resolve a status by id for a caller who may write content (a board drag). */
  async requireWritableStatus(
    actor: Actor,
    projectId: string,
    statusId: string,
  ): Promise<{ id: string; category: StatusCategoryDto }> {
    const { role } = await this.resolve(projectId, actor);
    if (!canWriteContent(role)) {
      throw new ForbiddenError("You need to be a project member to change status.");
    }
    return this.requireStatus(projectId, statusId);
  },

  async requireManage(projectId: string, actor: Actor) {
    const resolved = await this.resolve(projectId, actor);
    if (!canManageProject(resolved.role)) {
      throw new ForbiddenError("Only a project lead can change this project's statuses.");
    }
    if (resolved.context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    return resolved;
  },

  async resolve(projectId: string, actor: Actor) {
    const context = await ProjectService.getContext(projectId);
    // Tenant scope (F-1): a project outside the caller's org is absent, never
    // forbidden — a 403 confirms it exists.
    if (!context || context.organizationId !== actor.organizationId) {
      throw new NotFoundError("Project not found.");
    }
    const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));
    return { context, role };
  },
};
