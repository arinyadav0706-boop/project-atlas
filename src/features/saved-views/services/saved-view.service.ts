import type { Actor } from "@/shared/types/actor";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  SavedViewRepository,
} from "@/features/saved-views/repositories/saved-view.repository";
import { parseStoredFilter } from "@/features/saved-views/validation/saved-view.schemas";
import type {
  CreateSavedViewInput,
  UpdateSavedViewInput,
} from "@/features/saved-views/validation/saved-view.schemas";
import {
  DEFAULT_SORT,
  type CrossProjectIssueDto,
  type IssueQueryResultDto,
  type SavedViewDto,
  type SavedViewSortDto,
} from "@/features/saved-views/types/saved-view.types";

// Business rules: docs/02_Modules/22_saved_views.md (ADR-0040). RBAC is enforced
// here, server-side, on every call — the client never decides scope.

type ViewRow = Awaited<ReturnType<typeof SavedViewRepository.findById>>;

/**
 * THE security rule of this module (ADR-0040 §1, BR-1..BR-3).
 *
 * The projects a query may read come from the VIEWER's membership, never from
 * the saved filter. A view's `projectIds` can only narrow that set. This is
 * what makes a shared view safe: two people opening the same view each see
 * their own slice, and a view naming a project you are not in simply omits it
 * rather than leaking it or erroring.
 *
 * Returning `[]` is a real answer — "you can see nothing" — and every caller
 * must treat it as an empty result, not as "no filter, show everything".
 */
async function resolveProjectScope(actor: Actor, filter: IssueFilter): Promise<string[]> {
  const rows =
    actor.orgRole === "ADMIN"
      ? (await SavedViewRepository.allProjectIds(actor.organizationId)).map((p) => p.id)
      : (await SavedViewRepository.memberProjectIds(actor.organizationId, actor.userId)).map(
          (m) => m.projectId,
        );

  if (!filter.projectIds?.length) return rows;
  const requested = new Set(filter.projectIds);
  return rows.filter((id) => requested.has(id));
}

function toViewDto(row: NonNullable<ViewRow>, actor: Actor): SavedViewDto {
  // Re-validated on the way out (BR-7/BR-8): the column is JSON and Postgres
  // cannot enforce its shape.
  const { filter, corrupt } = parseStoredFilter(row.filter);
  return {
    id: row.id,
    name: row.name,
    filter,
    sort: row.sort as SavedViewSortDto,
    visibility: row.visibility,
    owner: row.owner,
    canEdit: row.ownerId === actor.userId || actor.orgRole === "ADMIN",
    filterCorrupt: corrupt,
  };
}

// `now` is passed in rather than read here, so every row on a page is judged
// overdue against ONE instant. Reading the clock per row lets two issues a
// millisecond apart disagree, and reading it during render is impure.
function toIssueDto(
  row: {
    id: string;
    key: string;
    title: string;
    type: string;
    status: string;
    priority: string;
    storyPoints: number | null;
    dueDate: Date | null;
    updatedAt: Date;
    version: number;
    projectId: string;
    project: { key: string; name: string };
    assignee: { id: string; name: string; avatarUrl: string | null } | null;
  },
  now: Date,
): CrossProjectIssueDto {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    type: row.type as CrossProjectIssueDto["type"],
    status: row.status as CrossProjectIssueDto["status"],
    priority: row.priority as CrossProjectIssueDto["priority"],
    storyPoints: row.storyPoints,
    dueDate: row.dueDate ? row.dueDate.toISOString() : null,
    // Done work is never overdue — it is finished, whatever the date said.
    dueOverdue:
      row.dueDate !== null && row.status !== "DONE" && row.dueDate.getTime() < now.getTime(),
    updatedAt: row.updatedAt.toISOString(),
    // Carried so a row can drive an optimistic edit later without a refetch.
    version: row.version,
    projectId: row.projectId,
    projectKey: row.project.key,
    projectName: row.project.name,
    assignee: row.assignee,
  };
}

export const SavedViewService = {
  /** The cross-project issue list (BR-1, BR-9, BR-12). */
  async queryIssues(
    actor: Actor,
    filter: IssueFilter,
    sort: SavedViewSortDto = DEFAULT_SORT,
    page: { cursor?: string; take?: number } = {},
  ): Promise<IssueQueryResultDto> {
    const projectIds = await resolveProjectScope(actor, filter);
    const take = Math.min(Math.max(page.take ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

    // No accessible projects is a legitimate empty result, and skipping the
    // query keeps `projectId IN ()` out of the database entirely.
    if (projectIds.length === 0) {
      return { items: [], nextCursor: null, projectsInScope: 0 };
    }

    const rows = await SavedViewRepository.listIssues(projectIds, filter, sort, {
      cursor: page.cursor,
      take,
    });

    // The repository fetched take+1 purely to answer "is there more".
    const hasMore = rows.length > take;
    const now = new Date();
    const items = (hasMore ? rows.slice(0, take) : rows).map((row) => toIssueDto(row, now));
    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
      projectsInScope: projectIds.length,
    };
  },

  /** Run a stored view (BR-1, BR-3, BR-8). */
  async queryByView(
    actor: Actor,
    viewId: string,
    page: { cursor?: string; take?: number } = {},
  ): Promise<{ view: SavedViewDto; result: IssueQueryResultDto }> {
    const view = await this.get(actor, viewId);
    const result = await this.queryIssues(actor, view.filter, view.sort, page);
    return { view, result };
  },

  async list(actor: Actor): Promise<SavedViewDto[]> {
    const rows = await SavedViewRepository.listViews(actor.organizationId, actor.userId);
    return rows.map((row) => toViewDto(row, actor));
  },

  async get(actor: Actor, id: string): Promise<SavedViewDto> {
    const row = await SavedViewRepository.findById(id, actor.organizationId);
    // A private view belonging to someone else is indistinguishable from one
    // that does not exist — a 403 here would confirm it is real.
    if (!row || (row.visibility === "PRIVATE" && row.ownerId !== actor.userId)) {
      throw new NotFoundError("View not found.");
    }
    return toViewDto(row, actor);
  },

  async create(actor: Actor, input: CreateSavedViewInput): Promise<SavedViewDto> {
    try {
      const row = await SavedViewRepository.create({
        organizationId: actor.organizationId,
        ownerId: actor.userId,
        name: input.name,
        filter: input.filter,
        sort: input.sort,
        visibility: input.visibility,
        actorId: actor.userId,
      });
      return toViewDto(row, actor);
    } catch (error) {
      // The unique index is the source of truth for BR-10; catching its
      // violation is what makes two simultaneous saves safe, where a
      // check-then-insert would let both through.
      if (isUniqueViolation(error)) {
        throw new ConflictError("You already have a view with that name.");
      }
      throw error;
    }
  },

  async update(
    actor: Actor,
    id: string,
    input: UpdateSavedViewInput,
  ): Promise<SavedViewDto> {
    await this.assertCanEdit(actor, id);
    try {
      const row = await SavedViewRepository.update(id, { ...input, actorId: actor.userId });
      return toViewDto(row, actor);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("You already have a view with that name.");
      }
      throw error;
    }
  },

  async remove(actor: Actor, id: string): Promise<void> {
    await this.assertCanEdit(actor, id);
    await SavedViewRepository.softDelete(id, actor.userId);
  },

  /**
   * Owner or org admin (BR-5). Sharing a view never confers write — otherwise
   * one reader's edit silently changes what the whole org sees.
   */
  async assertCanEdit(actor: Actor, id: string): Promise<void> {
    const row = await SavedViewRepository.findById(id, actor.organizationId);
    if (!row || (row.visibility === "PRIVATE" && row.ownerId !== actor.userId)) {
      throw new NotFoundError("View not found.");
    }
    if (row.ownerId !== actor.userId && actor.orgRole !== "ADMIN") {
      throw new ForbiddenError("Only the owner can change this view.");
    }
  },
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}
