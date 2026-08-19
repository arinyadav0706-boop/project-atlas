import type { Actor } from "@/shared/types/actor";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import { parseStoredFilter } from "@/features/saved-views/validation/saved-view.schemas";
import { SavedViewRepository } from "@/features/saved-views/repositories/saved-view.repository";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { DashboardRepository } from "@/features/dashboards/repositories/dashboard.repository";
import {
  LIST_WIDGET_ROWS,
  MAX_BREAKDOWN_SLICES,
  MAX_WIDGETS,
} from "@/features/dashboards/validation/dashboard.schemas";
import type {
  CreateDashboardInput,
  SetWidgetsInput,
  UpdateDashboardInput,
} from "@/features/dashboards/validation/dashboard.schemas";
import type {
  BreakdownByDto,
  BreakdownSliceDto,
  DashboardDto,
  DashboardSummaryDto,
  DashboardWidgetDto,
  WidgetDataDto,
} from "@/features/dashboards/types/dashboard.types";
import type { CrossProjectIssueDto } from "@/features/saved-views/types/saved-view.types";

// Business rules: docs/02_Modules/25_dashboards.md (ADR-0044). No admin
// capability gates any of this — dashboards are everyone's (§1). The security
// boundary is the project scope, resolved per VIEWER, exactly as in ADR-0040.

type DashboardRow = NonNullable<Awaited<ReturnType<typeof DashboardRepository.findById>>>;
type WidgetRow = DashboardRow["widgets"][number];

const STATUS_LABEL: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

const TITLE_CASE: Record<string, string> = {
  HIGHEST: "Highest",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  LOWEST: "Lowest",
  EPIC: "Epic",
  STORY: "Story",
  TASK: "Task",
  BUG: "Bug",
};

function toWidgetDto(row: WidgetRow): DashboardWidgetDto {
  const { filter, corrupt } = parseStoredFilter(row.filter);
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    width: row.width,
    position: row.position,
    filter,
    savedViewId: row.savedViewId,
    savedViewName: row.savedView?.name ?? null,
    breakdownBy: row.breakdownBy,
    filterCorrupt: corrupt,
  };
}

function toDashboardDto(row: DashboardRow, actor: Actor): DashboardDto {
  return {
    id: row.id,
    name: row.name,
    visibility: row.visibility,
    owner: row.owner,
    canEdit: row.ownerId === actor.userId || actor.orgRole === "ADMIN",
    widgets: row.widgets.map(toWidgetDto),
  };
}

export const DashboardService = {
  async list(actor: Actor): Promise<DashboardSummaryDto[]> {
    const rows = await DashboardRepository.list(actor.organizationId, actor.userId);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      visibility: row.visibility,
      owner: row.owner,
      canEdit: row.ownerId === actor.userId || actor.orgRole === "ADMIN",
      widgetCount: row._count.widgets,
    }));
  },

  async get(actor: Actor, id: string): Promise<DashboardDto> {
    const row = await DashboardRepository.findById(id, actor.organizationId);
    // Someone else's private dashboard is indistinguishable from one that does
    // not exist — a 403 would confirm it is real.
    if (!row || (row.visibility === "PRIVATE" && row.ownerId !== actor.userId)) {
      throw new NotFoundError("Dashboard not found.");
    }
    return toDashboardDto(row, actor);
  },

  async create(actor: Actor, input: CreateDashboardInput): Promise<DashboardDto> {
    try {
      const row = await DashboardRepository.create({
        organizationId: actor.organizationId,
        ownerId: actor.userId,
        name: input.name,
        visibility: input.visibility,
        actorId: actor.userId,
      });
      return toDashboardDto(row, actor);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("You already have a dashboard with that name.");
      }
      throw error;
    }
  },

  async update(actor: Actor, id: string, input: UpdateDashboardInput): Promise<DashboardDto> {
    await this.assertCanEdit(actor, id);
    try {
      const row = await DashboardRepository.update(id, { ...input, actorId: actor.userId });
      return toDashboardDto(row, actor);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError("You already have a dashboard with that name.");
      }
      throw error;
    }
  },

  async remove(actor: Actor, id: string): Promise<void> {
    await this.assertCanEdit(actor, id);
    await DashboardRepository.softDelete(id, actor.userId);
  },

  async setWidgets(actor: Actor, id: string, input: SetWidgetsInput): Promise<DashboardDto> {
    await this.assertCanEdit(actor, id);
    if (input.widgets.length > MAX_WIDGETS) {
      throw new ConflictError(`A dashboard can hold at most ${MAX_WIDGETS} widgets.`);
    }
    await DashboardRepository.setWidgets(
      id,
      input.widgets.map((w) => ({
        // Kept so an edit or a reorder updates the row instead of replacing
        // it; the repository ignores any id this dashboard does not own.
        id: w.id,
        title: w.title,
        type: w.type,
        width: w.width,
        // A widget carries one source or the other (BR-4). When it points at a
        // view the inline filter is dead weight, so it is not stored.
        filter: w.savedViewId ? {} : w.filter,
        savedViewId: w.savedViewId ?? null,
        breakdownBy: w.breakdownBy ?? null,
      })),
    );
    return this.get(actor, id);
  },

  /**
   * Every widget's data, in ONE request (ADR-0044 §5).
   *
   * The viewer's project scope is resolved once and reused across all widgets —
   * that membership read is the expensive part, and twelve widgets fetching
   * independently would repeat it twelve times.
   */
  async data(actor: Actor, id: string): Promise<WidgetDataDto[]> {
    const dashboard = await this.get(actor, id);
    if (dashboard.widgets.length === 0) return [];

    // Resolved ONCE. Everything below narrows within it and can never widen it.
    const visibleProjects = await this.visibleProjectIds(actor);
    // Saved views the viewer may actually see — a widget pointing at someone
    // else's private view must not silently fall back to unfiltered (BR-5).
    const views = await SavedViewRepository.listViews(actor.organizationId, actor.userId);
    const viewById = new Map(views.map((v) => [v.id, v]));

    const results: WidgetDataDto[] = [];
    for (const widget of dashboard.widgets) {
      results.push(await this.widgetData(actor, widget, visibleProjects, viewById));
    }
    return results;
  },

  async widgetData(
    actor: Actor,
    widget: DashboardWidgetDto,
    visibleProjects: string[],
    viewById: Map<string, { filter: unknown }>,
  ): Promise<WidgetDataDto> {
    let filter: IssueFilter = widget.filter;

    if (widget.savedViewId) {
      const view = viewById.get(widget.savedViewId);
      if (!view) {
        // Deleted, or private to somebody else. Unfiltered would be a WIDER
        // set than intended, so the widget says so instead.
        return {
          widgetId: widget.id,
          kind: "unavailable",
          reason: "This widget's saved view is no longer available to you.",
        };
      }
      // Read live, so editing the view updates the widget (BR-4).
      filter = parseStoredFilter(view.filter).filter;
    }

    // The widget's own projectIds narrow the viewer's set; they never widen it.
    const projectIds = filter.projectIds?.length
      ? visibleProjects.filter((p) => new Set(filter.projectIds).has(p))
      : visibleProjects;

    if (projectIds.length === 0) {
      return widget.type === "BREAKDOWN"
        ? { widgetId: widget.id, kind: "breakdown", slices: [], total: 0, projectsInScope: 0 }
        : widget.type === "LIST"
          ? { widgetId: widget.id, kind: "list", items: [], total: 0, projectsInScope: 0 }
          : { widgetId: widget.id, kind: "stat", count: 0, projectsInScope: 0 };
    }

    const predicates = await CustomFieldService.resolvePredicates(actor, filter.customFields);

    if (widget.type === "STAT") {
      const count = await DashboardRepository.countIssues(projectIds, filter, predicates);
      return { widgetId: widget.id, kind: "stat", count, projectsInScope: projectIds.length };
    }

    if (widget.type === "LIST") {
      const [rows, total] = await Promise.all([
        DashboardRepository.listIssues(projectIds, filter, predicates, LIST_WIDGET_ROWS),
        DashboardRepository.countIssues(projectIds, filter, predicates),
      ]);
      const now = new Date();
      return {
        widgetId: widget.id,
        kind: "list",
        items: rows.map((r) => toIssueDto(r, now)),
        total,
        projectsInScope: projectIds.length,
      };
    }

    const by = (widget.breakdownBy ?? "STATUS") as BreakdownByDto;
    const groups = await DashboardRepository.groupIssues(projectIds, filter, predicates, by);
    const slices = await this.labelSlices(groups, by);
    return {
      widgetId: widget.id,
      kind: "breakdown",
      slices,
      total: slices.reduce((sum, s) => sum + s.count, 0),
      projectsInScope: projectIds.length,
    };
  },

  /**
   * Turn raw group rows into labelled slices, capped (BR-10).
   *
   * A 200-person org would otherwise render 200 assignee bars. The remainder is
   * collapsed into "Other" rather than dropped, so the slices still sum to the
   * total and the chart does not quietly lie about how much it is showing.
   */
  async labelSlices(
    groups: Array<Record<string, unknown> & { _count: { _all: number } }>,
    by: BreakdownByDto,
  ): Promise<BreakdownSliceDto[]> {
    const column = by === "ASSIGNEE" ? "assigneeId" : by.toLowerCase();
    const raw = groups
      .map((g) => ({ key: (g[column] as string | null) ?? "", count: g._count._all }))
      .sort((a, b) => b.count - a.count);

    let names = new Map<string, string>();
    if (by === "ASSIGNEE") {
      const ids = raw.map((r) => r.key).filter(Boolean);
      const users = ids.length ? await DashboardRepository.usersByIds(ids) : [];
      names = new Map(users.map((u) => [u.id, u.name]));
    }

    const label = (key: string): string => {
      if (key === "") return by === "ASSIGNEE" ? "Unassigned" : "None";
      if (by === "STATUS") return STATUS_LABEL[key] ?? key;
      if (by === "ASSIGNEE") return names.get(key) ?? "Unknown";
      return TITLE_CASE[key] ?? key;
    };

    const shown = raw.slice(0, MAX_BREAKDOWN_SLICES).map((r) => ({
      key: r.key || "__none__",
      label: label(r.key),
      count: r.count,
    }));
    const rest = raw.slice(MAX_BREAKDOWN_SLICES);
    if (rest.length > 0) {
      shown.push({
        key: "__other__",
        label: `Other (${rest.length})`,
        count: rest.reduce((sum, r) => sum + r.count, 0),
      });
    }
    return shown;
  },

  /** The viewer's projects — the same rule as ADR-0040 §1. */
  async visibleProjectIds(actor: Actor): Promise<string[]> {
    if (actor.orgRole === "ADMIN") {
      return (await SavedViewRepository.allProjectIds(actor.organizationId)).map((p) => p.id);
    }
    return (
      await SavedViewRepository.memberProjectIds(actor.organizationId, actor.userId)
    ).map((m) => m.projectId);
  },

  /** Owner or org admin (BR-2). Sharing never confers write. */
  async assertCanEdit(actor: Actor, id: string): Promise<void> {
    const row = await DashboardRepository.findById(id, actor.organizationId);
    if (!row || (row.visibility === "PRIVATE" && row.ownerId !== actor.userId)) {
      throw new NotFoundError("Dashboard not found.");
    }
    if (row.ownerId !== actor.userId && actor.orgRole !== "ADMIN") {
      throw new ForbiddenError("Only the owner can change this dashboard.");
    }
  },
};

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
    parentId?: string | null;
    parent?: { key: string } | null;
    _count?: { linksIn: number };
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
    dueOverdue:
      row.dueDate !== null && row.status !== "DONE" && row.dueDate.getTime() < now.getTime(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
    projectId: row.projectId,
    projectKey: row.project.key,
    projectName: row.project.name,
    assignee: row.assignee,
    parentId: row.parentId ?? null,
    parentKey: row.parent?.key,
    blockedBy: row._count?.linksIn ?? 0,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}
