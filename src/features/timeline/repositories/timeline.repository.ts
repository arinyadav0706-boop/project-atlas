import { prisma } from "@/shared/lib/db";
import { issueFilterWhere } from "@/features/issues/repositories/issue-filter.repository";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type { ResolvedPredicate } from "@/features/custom-fields/lib/field-predicate";

// Timeline (ADR-0047). Prisma lives only in `*.repository.ts`
// (Feature Architecture §4).

const rowSelect = {
  id: true,
  key: true,
  title: true,
  type: true,
  status: true,
  priority: true,
  startDate: true,
  dueDate: true,
  version: true,
  epicId: true,
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  _count: {
    select: {
      linksIn: {
        where: { type: "BLOCKS" as const, source: { deletedAt: null, status: { not: "DONE" as const } } },
      },
    },
  },
} as const;

export const TimelineRepository = {
  /**
   * Dated issues for the chart: the soonest-DUE first (BR-10).
   *
   * `take + 1` so the service can tell "exactly at the cap" from "more than the
   * cap" without a second count — the difference decides whether the UI admits
   * to truncating.
   *
   * Ordered by `dueDate`, not `startDate`, and that is load-bearing. The chart
   * displays rows by effective start (`startDate ?? dueDate`), which SQL cannot
   * express without COALESCE — so ordering here by `startDate` would make the
   * database's "first 200" a different set from the one the service then sorts
   * and shows. The cap would silently drop rows the chart had already decided
   * to draw, which is exactly the bug that lost a linked pair (and its arrow)
   * off the bottom of the chart.
   *
   * `dueDate` is total here — every row in this query has one, by definition —
   * so the cut is deterministic and the rule is one a person can state: the
   * next 200 things due.
   */
  datedIssues(
    projectId: string,
    filter: IssueFilter,
    predicates: ResolvedPredicate[],
    take: number,
  ) {
    return prisma.issue.findMany({
      where: {
        ...issueFilterWhere({ projectIds: [projectId] }, filter, predicates),
        // BR-2: a due date is the minimum for a bar. Nothing without one is
        // ever given an invented position.
        dueDate: { not: null },
      },
      select: rowSelect,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: take + 1,
    });
  },

  /** Undated issues for the tray (BR-12). */
  unscheduledIssues(
    projectId: string,
    filter: IssueFilter,
    predicates: ResolvedPredicate[],
    take: number,
  ) {
    return prisma.issue.findMany({
      where: {
        ...issueFilterWhere({ projectIds: [projectId] }, filter, predicates),
        dueDate: null,
        startDate: null,
      },
      select: rowSelect,
      orderBy: [{ rank: "asc" }, { id: "asc" }],
      take,
    });
  },

  /**
   * Epics carrying no due date of their own — the ONLY ones the roll-up is for
   * (BR-6).
   *
   * A separate query because `datedIssues` requires a due date by definition,
   * so an epic that has none is absent from it. Deriving the roll-up set from
   * that result would mean it never fired for exactly the epics it exists to
   * serve — which is the shape of the bug this method was written to fix.
   */
  undatedEpics(projectId: string, filter: IssueFilter, predicates: ResolvedPredicate[]) {
    return prisma.issue.findMany({
      where: {
        ...issueFilterWhere({ projectIds: [projectId] }, filter, predicates),
        type: "EPIC",
        dueDate: null,
      },
      select: rowSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  },

  /**
   * Children of the epics on screen, for the roll-up (BR-6).
   *
   * Only their dates — the roll-up needs a min and a max, not whole rows, and
   * an epic with 200 children should not cost 200 card selects.
   */
  childDatesForEpics(epicIds: string[]) {
    if (epicIds.length === 0) return Promise.resolve([]);
    return prisma.issue.findMany({
      where: { epicId: { in: epicIds }, deletedAt: null, dueDate: { not: null } },
      select: { epicId: true, startDate: true, dueDate: true },
    });
  },

  /** Sprint bands (BR-9). Only sprints that have real dates to draw. */
  sprintsWithDates(projectId: string) {
    return prisma.sprint.findMany({
      where: {
        projectId,
        deletedAt: null,
        startDate: { not: null },
        endDate: { not: null },
      },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
      orderBy: { startDate: "asc" },
    });
  },

  /**
   * BLOCKS edges where BOTH ends are on screen (BR-7).
   *
   * An arrow to a bar that is not drawn is a line into empty space, so the
   * query is bounded by the visible set rather than by the project.
   */
  linksAmong(issueIds: string[]) {
    if (issueIds.length === 0) return Promise.resolve([]);
    return prisma.issueLink.findMany({
      where: {
        type: "BLOCKS",
        sourceId: { in: issueIds },
        targetId: { in: issueIds },
      },
      select: { id: true, sourceId: true, targetId: true },
    });
  },

  /** Version-checked reschedule (ADR-0011). Null on a lost update. */
  async setScheduleWithVersion(
    id: string,
    expectedVersion: number,
    data: { startDate?: Date | null; dueDate?: Date | null },
    actorId: string,
  ) {
    const result = await prisma.issue.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        ...(data.startDate !== undefined ? { startDate: data.startDate } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
        version: { increment: 1 },
        updatedBy: actorId,
      },
    });
    if (result.count === 0) return null;
    return prisma.issue.findFirst({ where: { id }, select: rowSelect });
  },
};
