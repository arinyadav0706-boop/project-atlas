import type { Prisma } from "@prisma/client";
import { prisma } from "@/shared/lib/db";
import { issueFilterWhere } from "@/features/issues/repositories/issue-filter.repository";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type { ResolvedPredicate } from "@/features/custom-fields/lib/field-predicate";
import type { BreakdownByDto } from "@/features/dashboards/types/dashboard.types";

// Dashboards (ADR-0044). Prisma lives only in `*.repository.ts`
// (Feature Architecture §4).

const widgetSelect = {
  id: true,
  title: true,
  type: true,
  width: true,
  position: true,
  filter: true,
  savedViewId: true,
  breakdownBy: true,
  savedView: { select: { id: true, name: true, visibility: true, ownerId: true, filter: true } },
} as const;

const dashboardSelect = {
  id: true,
  name: true,
  visibility: true,
  ownerId: true,
  owner: { select: { id: true, name: true } },
  widgets: { select: widgetSelect, orderBy: { position: "asc" } },
} as const;

/** Which Issue column a breakdown groups on. */
const GROUP_COLUMN: Record<BreakdownByDto, "status" | "priority" | "type" | "assigneeId"> = {
  STATUS: "status",
  PRIORITY: "priority",
  TYPE: "type",
  ASSIGNEE: "assigneeId",
};

export const DashboardRepository = {
  /** The caller's own plus everything shared in their org. */
  list(organizationId: string, userId: string) {
    return prisma.dashboard.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [{ ownerId: userId }, { visibility: "SHARED" }],
      },
      select: {
        id: true,
        name: true,
        visibility: true,
        ownerId: true,
        owner: { select: { id: true, name: true } },
        _count: { select: { widgets: true } },
      },
      orderBy: { name: "asc" },
    });
  },

  findById(id: string, organizationId: string) {
    return prisma.dashboard.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: dashboardSelect,
    });
  },

  create(data: {
    organizationId: string;
    ownerId: string;
    name: string;
    visibility: "PRIVATE" | "SHARED";
    actorId: string;
  }) {
    const { actorId, ...fields } = data;
    return prisma.dashboard.create({
      data: { ...fields, createdBy: actorId, updatedBy: actorId },
      select: dashboardSelect,
    });
  },

  update(
    id: string,
    data: { name?: string; visibility?: "PRIVATE" | "SHARED"; actorId: string },
  ) {
    return prisma.dashboard.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
        updatedBy: data.actorId,
      },
      select: dashboardSelect,
    });
  },

  softDelete(id: string, actorId: string) {
    return prisma.dashboard.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorId },
      select: { id: true },
    });
  },

  /**
   * Replace the whole widget set atomically — the payload's order IS the
   * display order, so there is no separate reorder call to fall out of step.
   *
   * Widgets carrying an id are updated in place rather than recreated. They
   * hold no data worth preserving (a widget is a query, not a result), but
   * their ids key the batched data response: recreating them on every save
   * would invalidate that map and make a drag-reorder blank every card while
   * it refetched.
   */
  async setWidgets(
    dashboardId: string,
    widgets: {
      id?: string;
      title: string;
      type: string;
      width: string;
      filter: IssueFilter;
      savedViewId: string | null;
      breakdownBy: string | null;
    }[],
  ) {
    const existing = await prisma.dashboardWidget.findMany({
      where: { dashboardId },
      select: { id: true },
    });
    const known = new Set(existing.map((w) => w.id));
    // An id this dashboard does not own is treated as a create, never an
    // update — otherwise a crafted payload could rewrite another dashboard's
    // widget by guessing its id.
    const isUpdate = (id?: string): id is string => Boolean(id && known.has(id));
    const keep = widgets.map((w) => w.id).filter(isUpdate);

    await prisma.$transaction([
      prisma.dashboardWidget.deleteMany({
        where: { dashboardId, id: { notIn: keep } },
      }),
      ...widgets.map((w, i) => {
        const data = {
          title: w.title,
          type: w.type as Prisma.DashboardWidgetCreateInput["type"],
          width: w.width as Prisma.DashboardWidgetCreateInput["width"],
          position: i,
          filter: w.filter as Prisma.InputJsonValue,
          savedViewId: w.savedViewId,
          breakdownBy: w.breakdownBy as Prisma.DashboardWidgetCreateInput["breakdownBy"],
        };
        return isUpdate(w.id)
          ? prisma.dashboardWidget.update({ where: { id: w.id }, data })
          : prisma.dashboardWidget.create({ data: { dashboardId, ...data } });
      }),
    ]);
  },

  // ── Widget data ──────────────────────────────────────────────────────────

  countIssues(
    projectIds: string[],
    filter: IssueFilter,
    predicates: ResolvedPredicate[],
  ) {
    return prisma.issue.count({
      where: issueFilterWhere({ projectIds }, filter, predicates),
    });
  },

  /**
   * Group counts for a breakdown.
   *
   * `groupBy` rather than fetching rows and counting in JS: the whole point of
   * a breakdown widget is that it does not need the issues themselves, and
   * pulling 3,600 rows to count four statuses would be absurd.
   */
  groupIssues(
    projectIds: string[],
    filter: IssueFilter,
    predicates: ResolvedPredicate[],
    by: BreakdownByDto,
  ) {
    const column = GROUP_COLUMN[by];
    // Sorted in JS, not SQL: a dynamic `orderBy: { _count: { [column]: … } }`
    // defeats Prisma's overload resolution, and a breakdown returns at most a
    // few hundred groups (four statuses, five priorities, N assignees) — the
    // sort is free at that size and the query stays typed.
    return prisma.issue.groupBy({
      by: [column],
      where: issueFilterWhere({ projectIds }, filter, predicates),
      _count: { _all: true },
    });
  },

  listIssues(
    projectIds: string[],
    filter: IssueFilter,
    predicates: ResolvedPredicate[],
    take: number,
  ) {
    return prisma.issue.findMany({
      where: issueFilterWhere({ projectIds }, filter, predicates),
      select: {
        id: true,
        key: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        storyPoints: true,
        dueDate: true,
        updatedAt: true,
        version: true,
        projectId: true,
        project: { select: { key: true, name: true } },
        assignee: { select: { id: true, name: true, avatarUrl: true } },
        // Same reason as the cross-project list (ADR-0045 §6): a list widget
        // can contain subtasks, and a row without its parent is unreadable.
        parentId: true,
        parent: { select: { key: true } },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take,
    });
  },

  /** Names for ASSIGNEE breakdown groups, in one query rather than N. */
  usersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    });
  },
};
