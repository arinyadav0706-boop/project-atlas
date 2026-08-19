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
// One card shape + mapper for every list surface (ADR-0018/0026).
import { toIssueCardDto } from "@/features/issues/services/issue-card.mapper";
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
import {
  SUBTASK_PARENT_TYPES,
  type EpicSummaryDto,
  type IssueChildDto,
  type IssueDetailDto,
  type IssueListPageDto,
  type IssueParentDto,
  type IssueStatusCounts,
  type IssueStatusDto,
  type IssueTypeDto,
  type SubtaskDto,
  type SubtaskListDto,
  type SubtaskProgressDto,
} from "@/features/issues/types/issue.types";
import type {
  CreateIssueInput,
  CreateSubtaskInput,
  ReorderIssueInput,
  UpdateIssueInput,
} from "@/features/issues/validation/issue.schemas";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";
import { elevate, canWriteContent, canManageProject } from "@/features/authorization/permission";
import {
  assertValidEpicParent,
  assertValidSubtaskParent,
} from "@/features/issues/services/hierarchy";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { DependencyService } from "@/features/dependencies/services/dependency.service";
import type { IssueLinksDto } from "@/features/dependencies/types/dependency.types";

// Business rules from docs/02_Modules/04_issues.md. RBAC + the fixed
// workflow are enforced here, server-side, per the actor's effective project
// role (permission engine, ADR-0024).

type IssueRow = NonNullable<Awaited<ReturnType<typeof IssueRepository.findDetail>>>;

/**
 * What `create` accepts internally.
 *
 * Wider than the route's `CreateIssueInput` in exactly two ways, both of which
 * a client must never supply: `type` may be `SUBTASK`, and the parent/sprint
 * may be set. Those come from `createSubtask`, which has already validated the
 * parent — the public schema still refuses them, so there is no path from a
 * request body to an orphan subtask.
 */
type InternalCreateIssueInput = Omit<CreateIssueInput, "type"> & {
  type: IssueTypeDto;
  parentId?: string | null;
  sprintId?: string | null;
};

const canWrite = canWriteContent;

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
  // Effective role: org admins act as LEAD (ADR-0024). F-1 is already enforced
  // above, so elevation never crosses tenants.
  const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));
  return { context, role };
}


/** Types that may parent a subtask (BR-2). Never an Epic, never a subtask. */
const canParentSubtask = (type: IssueTypeDto): boolean =>
  (SUBTASK_PARENT_TYPES as readonly string[]).includes(type);

/**
 * Roll up a parent + its subtasks (BR-11).
 *
 * Counts and minutes only. Story points are absent by design, not by omission:
 * a subtask cannot carry them (BR-6), because a 5-point story split into a 3
 * and a 2 would make velocity read 10.
 */
function rollUp(
  parentEstimate: number | null,
  subtasks: { status: IssueStatusDto; estimateMinutes: number | null }[],
): SubtaskProgressDto {
  const estimates = [parentEstimate, ...subtasks.map((s) => s.estimateMinutes)].filter(
    (m): m is number => m !== null,
  );
  return {
    total: subtasks.length,
    done: subtasks.filter((s) => s.status === "DONE").length,
    // Null rather than 0 when nothing is estimated — "0 minutes of work left"
    // and "nobody has estimated this" are different claims, and showing the
    // first when you mean the second is how a plan quietly lies.
    estimateMinutes: estimates.length ? estimates.reduce((a, b) => a + b, 0) : null,
  };
}

function toDetailDto(
  row: IssueRow,
  actor: Actor,
  role: ProjectRoleDto | null,
  children: IssueChildDto[] = [],
  subtasks: SubtaskDto[] = [],
  dependencies: IssueLinksDto = { links: [], openBlockerKeys: [] },
): IssueDetailDto {
  const canDelete =
    role === "LEAD" || row.reporterId === actor.userId || row.assigneeId === actor.userId;
  const epic: EpicSummaryDto | null = row.epic
    ? { id: row.epic.id, key: row.epic.key, title: row.epic.title }
    : null;
  const parent: IssueParentDto | null = row.parent
    ? {
        id: row.parent.id,
        key: row.parent.key,
        title: row.parent.title,
        type: row.parent.type,
        status: row.parent.status,
      }
    : null;
  return {
    ...toIssueCardDto(row),
    description: row.description,
    reporter: row.reporter,
    epicId: row.epicId,
    epic,
    children,
    parentId: row.parentId,
    parent,
    subtasks,
    subtaskProgress: rollUp(row.estimateMinutes, subtasks),
    canHaveSubtasks: canParentSubtask(row.type),
    links: dependencies.links,
    openBlockerKeys: dependencies.openBlockerKeys,
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

// Hierarchy guards (BR-4, ADR-0026) live in one shared helper, reused by the
// backlog/sprint epic-reassignment moves too.
const validateEpic = assertValidEpicParent;

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

    return { items: items.map(toIssueCardDto), nextCursor, counts };
  },

  async get(actor: Actor, issueId: string): Promise<IssueDetailDto> {
    const row = await IssueRepository.findDetail(issueId);
    if (!row) throw new NotFoundError("Issue not found.");
    // resolve() enforces the tenant scope (F-1) and yields the caller's role.
    const { role } = await resolve(row.projectId, actor);
    // Each extra read is conditional on the row's type, so a plain Task costs
    // exactly what it did before subtasks existed: children only for an Epic
    // (ADR-0026), subtasks only for a type that can have them (ADR-0045). Both
    // parents are already on the row (no N+1).
    const [children, subtasks, dependencies] = await Promise.all([
      row.type === "EPIC"
        ? IssueRepository.listChildren(row.id)
        : Promise.resolve([] as Awaited<ReturnType<typeof IssueRepository.listChildren>>),
      canParentSubtask(row.type)
        ? IssueRepository.listSubtasks(row.id)
        : Promise.resolve([] as Awaited<ReturnType<typeof IssueRepository.listSubtasks>>),
      // Unconditional, unlike the two above: any issue can be linked to any
      // other, so there is no type that could skip this.
      DependencyService.list(actor, row.id),
    ]);
    // Best-effort engagement signal for Home's "Continue working" (ADR-0012).
    await RecentItemService.record(actor, "ISSUE", issueId, "VIEWED");
    return toDetailDto(
      row,
      actor,
      role,
      children.map((c) => ({
        id: c.id,
        key: c.key,
        title: c.title,
        type: c.type,
        status: c.status,
      })),
      subtasks,
      dependencies,
    );
  },

  /** A parent's subtasks plus the roll-up, for the panel's own refreshes. */
  async listSubtasks(actor: Actor, parentId: string): Promise<SubtaskListDto> {
    const row = await IssueRepository.findDetail(parentId);
    if (!row) throw new NotFoundError("Issue not found.");
    await resolve(row.projectId, actor); // tenant scope (F-1)
    const items = canParentSubtask(row.type)
      ? await IssueRepository.listSubtasks(parentId)
      : [];
    return { items, progress: rollUp(row.estimateMinutes, items) };
  },

  /**
   * Create a subtask under a parent (BR-12).
   *
   * Delegates to `create` rather than duplicating it: a subtask is an issue, so
   * everything create already does — RBAC, the archived-project check, assignee
   * validation, required custom fields, the key counter, the assignment
   * notification — has to happen here too, and a second write path would be a
   * second place for those to drift.
   */
  async createSubtask(
    actor: Actor,
    parentId: string,
    input: CreateSubtaskInput,
  ): Promise<IssueDetailDto> {
    const parentRow = await IssueRepository.findDetail(parentId);
    if (!parentRow) throw new NotFoundError("Parent issue not found.");
    // Every hierarchy rule — parent type, same project, no nesting, the cap —
    // in the one guard, and it hands back the parent's sprint (BR-4).
    const parent = await assertValidSubtaskParent(parentRow.projectId, parentId);
    return this.create(actor, parentRow.projectId, {
      ...input,
      type: "SUBTASK",
      parentId: parent.id,
      // BR-4: a subtask has no sprint of its own, it is wherever its parent is.
      sprintId: parent.sprintId,
    });
  },

  // A project's epics for the create/edit selector and the board Epic filter
  // (ADR-0026). Read-only; visible to any org member who can see the project.
  async listEpics(actor: Actor, projectId: string): Promise<EpicSummaryDto[]> {
    await resolve(projectId, actor); // existence + tenant scope (F-1)
    return IssueRepository.listEpics(projectId);
  },

  async create(
    actor: Actor,
    projectId: string,
    input: InternalCreateIssueInput,
  ): Promise<IssueDetailDto> {
    const { context, role } = await resolve(projectId, actor);
    if (!canWrite(role)) {
      throw new ForbiddenError("You need to be a project member to create issues.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    // Estimate is a LEAD-only planning decision (ADR-0030 BR-5). A non-lead who
    // sends one is rejected, mirroring the dedicated estimate endpoint.
    if (input.estimateMinutes != null && !canManageProject(role)) {
      throw new ForbiddenError("Only a project lead can set the estimate.");
    }
    // BR-6: refused, not silently dropped. A client that sends points on a
    // subtask has a wrong model of the hierarchy and should be told.
    if (input.type === "SUBTASK" && input.storyPoints != null) {
      throw new ValidationError(
        "A subtask can't carry story points — estimate the parent instead.",
      );
    }
    await validateAssignee(projectId, input.assigneeId);
    await validateEpic(projectId, input.epicId, { type: input.type });

    // Required custom fields are enforced HERE and nowhere else (ADR-0042 §4):
    // blocking edits instead would make every pre-existing issue unsavable the
    // moment somebody adds a required field to an established project.
    const missing = await CustomFieldService.missingRequired(
      projectId,
      input.customFields ?? {},
    );
    if (missing.length > 0) {
      throw new ValidationError(
        `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required on new issues in this project.`,
      );
    }

    const row = await IssueRepository.createWithKey({
      projectId,
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      priority: input.priority,
      assigneeId: input.assigneeId ?? null,
      reporterId: actor.userId,
      epicId: input.epicId ?? null,
      parentId: input.parentId ?? null,
      sprintId: input.sprintId ?? null,
      storyPoints: input.storyPoints ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      estimateMinutes: input.estimateMinutes ?? null,
      creatorId: actor.userId,
    });
    // After the issue exists, because a value row needs an issueId. A bad
    // value throws and leaves the issue created — acceptable, and far better
    // than the alternative of validating twice or wrapping the key generator
    // in someone else's transaction.
    if (input.customFields && Object.keys(input.customFields).length > 0) {
      await CustomFieldService.setForIssue(
        actor,
        { id: row.id, projectId },
        { values: input.customFields },
      );
    }
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
    // ── Subtask conversions (BR-10, ADR-0045 §10) ─────────────────────────
    //
    // `parentId` and `type` are decided together, here, so the pair can never
    // be written in a state the CHECK constraint would reject. An explicit
    // `parentId` drives the type; a `type` change of its own can only ever
    // promote a subtask out.
    let parentIdWrite: string | null | undefined = undefined;
    let convertedType: IssueTypeDto | undefined = undefined;
    // BR-4: becoming a subtask means adopting the parent's sprint, in the same
    // write. Leaving it behind would put a subtask in a different sprint from
    // its parent, which is exactly the split BR-4 exists to prevent.
    let sprintIdWrite: string | null | undefined = undefined;

    if (input.parentId !== undefined) {
      if (input.parentId === null) {
        // Subtask → issue. Becomes a plain TASK unless the caller asked for a
        // specific standalone type in the same request.
        parentIdWrite = null;
        convertedType =
          input.type && input.type !== "SUBTASK" ? input.type : "TASK";
      } else {
        // Issue → subtask.
        if (existing.type === "EPIC") {
          throw new ValidationError(
            "An Epic can't become a subtask. Convert it to a Story or Task first.",
          );
        }
        const epicChildren = await IssueRepository.listChildren(existing.id);
        if (epicChildren.length > 0) {
          throw new ConflictError(
            "This issue has child issues under it — reassign them before making it a subtask.",
          );
        }
        const parent = await assertValidSubtaskParent(existing.projectId, input.parentId, {
          id: existing.id,
        });
        parentIdWrite = input.parentId;
        convertedType = "SUBTASK";
        if (parent.sprintId !== existing.sprintId) sprintIdWrite = parent.sprintId;
      }
    } else if (input.type && input.type !== "SUBTASK" && existing.type === "SUBTASK") {
      // Changing a subtask's type without naming a parent detaches it — the
      // alternative is writing a non-SUBTASK row that still has a parentId,
      // which the CHECK constraint would reject as a 500 rather than a clear
      // error.
      parentIdWrite = null;
    } else if (input.type === "SUBTASK" && existing.type !== "SUBTASK") {
      throw new ValidationError(
        "Choose a parent to convert this into a subtask.",
      );
    }

    // Hierarchy integrity on type/parent changes (BR-4, ADR-0026).
    const effectiveType = convertedType ?? input.type ?? (existing.type as IssueTypeDto);

    // BR-6 on the edit path. Only an EXPLICIT points value is refused; points
    // the issue already had are cleared by the conversion below rather than
    // turned into an error the user cannot act on from the convert dialog.
    if (effectiveType === "SUBTASK" && input.storyPoints != null) {
      throw new ValidationError(
        "A subtask can't carry story points — estimate the parent instead.",
      );
    }
    // Converting an Epic that still has children to another type would leave
    // those children under a non-epic parent — block it (fix children first).
    if (existing.type === "EPIC" && input.type && input.type !== "EPIC") {
      const children = await IssueRepository.listChildren(existing.id);
      if (children.length > 0) {
        throw new ConflictError(
          "This Epic has child issues — reassign or remove them before changing its type.",
        );
      }
    }
    // Decide the parent to persist. An explicit epicId is validated against the
    // effective type; converting an issue INTO an Epic clears any parent it had
    // (an Epic can never be a child).
    let epicIdWrite: string | null | undefined = undefined;
    if (input.epicId !== undefined) {
      await validateEpic(existing.projectId, input.epicId, {
        type: effectiveType,
        id: existing.id,
      });
      epicIdWrite = input.epicId;
    } else if (effectiveType === "EPIC" && existing.epicId) {
      epicIdWrite = null;
    } else if (effectiveType === "SUBTASK" && existing.epicId) {
      // BR-3: a subtask reaches its epic through its parent, so becoming one
      // releases any epic it held directly.
      epicIdWrite = null;
    }

    // Becoming a subtask clears the points it can no longer carry (BR-6). The
    // UI warns before this happens — it is not a silent loss.
    const storyPointsWrite =
      effectiveType === "SUBTASK" && existing.storyPoints !== null
        ? null
        : input.storyPoints;

    // Optimistic concurrency (ADR-0011): scalar FKs (assigneeId/epicId/parentId)
    // are set directly rather than via relation connect/disconnect, because the
    // version-checked write uses updateMany (which sets only scalar columns).
    const row = await IssueRepository.updateWithVersion(
      issueId,
      input.expectedVersion,
      {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        // `effectiveType`, not `input.type`: a conversion decides the type from
        // the parent, and writing the raw input here would let the pair drift
        // into the state the CHECK constraint rejects.
        ...(effectiveType !== existing.type ? { type: effectiveType } : {}),
        ...(parentIdWrite !== undefined ? { parentId: parentIdWrite } : {}),
        ...(sprintIdWrite !== undefined ? { sprintId: sprintIdWrite } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}),
        ...(epicIdWrite !== undefined ? { epicId: epicIdWrite } : {}),
        ...(storyPointsWrite !== undefined ? { storyPoints: storyPointsWrite } : {}),
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
    await this.assertSubtasksAllowDone(existing.id, existing.type as IssueTypeDto, to);

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
    // …and anyone this issue was blocking (ADR-0046 §6). Best-effort inside
    // the service it belongs to, so a notification failure can never fail the
    // transition that triggered it.
    if (to === "DONE") {
      await DependencyService.notifyUnblocked(actor, { id: issueId, key: existing.key });
    }
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
    // A drag into the Done column is a transition, so it answers to BR-7 too.
    // Guarding only the status endpoint would leave the board as the way round
    // the rule, which is worse than not having the rule.
    if (statusChanged) {
      await this.assertSubtasksAllowDone(
        existing.id,
        existing.type as IssueTypeDto,
        destStatus,
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
      // A drag into Done unblocks people exactly as the status menu does
      // (ADR-0046 §6). Wiring only the menu would make the notification depend
      // on which control someone happened to use.
      if (destStatus === "DONE") {
        await DependencyService.notifyUnblocked(actor, {
          id: existing.id,
          key: existing.key,
        });
      }
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
    // A subtask is never in the backlog (BR-5), so it can never be reordered
    // within one. The UI cannot offer this; the check is here because the API
    // is reachable without it.
    if (existing.type === "SUBTASK") {
      throw new ValidationError(
        "A subtask is ordered under its parent, not in the backlog.",
      );
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

    // Group-by-epic drag (ADR-0026): a backlog drop into a different epic group
    // reassigns the parent in the SAME atomic, version-checked write as the
    // reorder — no second round-trip, no duplicate move logic.
    if (input.epicId !== undefined) {
      await assertValidEpicParent(existing.projectId, input.epicId, {
        type: existing.type as IssueTypeDto,
        id: existing.id,
      });
    }

    const row = await IssueRepository.reorderWithVersion(
      existing.id,
      input.expectedVersion,
      { rank, ...(input.epicId !== undefined ? { epicId: input.epicId } : {}) },
      actor.userId,
    );
    if (!row) {
      throw new ConflictError(
        "This item was changed by someone else — refresh the backlog and try the move again.",
      );
    }
    return toDetailDto(row, actor, role);
  },

  /**
   * BR-7 — a parent cannot move into DONE while a subtask is open.
   *
   * Jira warns and lets you through. EAGLES refuses, because cycle time and
   * velocity are both replayed from status transitions (ADR-0031): a story
   * marked Done over three open subtasks records a completion that did not
   * happen, and every number downstream is then wrong in a way nobody can see.
   *
   * Scoped narrowly on purpose — it fires only on the move INTO Done, so adding
   * a subtask to an already-done parent stays legal (that is new discovery, not
   * a false completion).
   */
  async assertSubtasksAllowDone(
    issueId: string,
    type: IssueTypeDto,
    to: IssueStatusDto,
  ): Promise<void> {
    if (to !== "DONE" || !canParentSubtask(type)) return;
    const open = await IssueRepository.countOpenSubtasks(issueId);
    if (open > 0) {
      throw new ConflictError(
        `${open} ${open === 1 ? "subtask is" : "subtasks are"} still open — finish or remove ${open === 1 ? "it" : "them"} before marking this done.`,
      );
    }
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
    // Two different relationships, two different rules — each stated where it
    // applies rather than one rule awkwardly covering both.
    //
    // An Epic's children DETACH (epicId → null, ADR-0026 §2): they are real work
    // items that outlive the grouping. A parent's subtasks CASCADE (ADR-0045
    // §9): "write the tests", detached from "add login", is noise nobody will
    // ever triage. Both are soft — the app never hard-deletes.
    if (existing.type === "EPIC") {
      await IssueRepository.detachChildren(existing.id, actor.userId);
    }
    if (canParentSubtask(existing.type as IssueTypeDto)) {
      await IssueRepository.softDeleteSubtasks(existing.id, actor.userId);
    }
    await IssueRepository.softDelete(issueId, actor.userId);
  },
};
