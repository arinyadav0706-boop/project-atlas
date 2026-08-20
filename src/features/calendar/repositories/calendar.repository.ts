import { prisma } from "@/shared/lib/db";
import { issueFilterWhere } from "@/features/issues/repositories/issue-filter.repository";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type { ResolvedPredicate } from "@/features/custom-fields/lib/field-predicate";

// Calendar (ADR-0048). Prisma lives only in `*.repository.ts`
// (Feature Architecture §4).
//
// There is no write method here on purpose: every calendar write goes through
// the Timeline's `PATCH /api/issues/{id}/schedule` (ADR-0048 §7), so the two
// views cannot drift on version checking, RBAC or the start-after-due refusal.

const eventSelect = {
  id: true,
  key: true,
  title: true,
  type: true,
  status: true,
  priority: true,
  startDate: true,
  dueDate: true,
  version: true,
  assignee: { select: { id: true, name: true, avatarUrl: true } },
  _count: {
    select: {
      linksIn: {
        where: {
          type: "BLOCKS" as const,
          source: { deletedAt: null, status: { not: "DONE" as const } },
        },
      },
    },
  },
} as const;

export const CalendarRepository = {
  /**
   * Everything whose span touches `[from, to]`.
   *
   * The overlap test is deliberately written against the EFFECTIVE start
   * (`startDate ?? dueDate`, BR-2) rather than against `startDate` alone: an
   * issue with a due date inside the window and no start would otherwise be
   * missed by a `startDate <= to` predicate, and that is most of the data.
   *
   * Expressed as two ORed shapes rather than a COALESCE, because Prisma cannot
   * express COALESCE in a where clause and raw SQL here would lose the shared
   * filter builder — which is where tenant scope and the custom-field
   * predicates live.
   *
   * `take + 1` so the service can tell "exactly at the cap" from "more than the
   * cap" without a second count.
   */
  eventsInWindow(
    projectId: string,
    filter: IssueFilter,
    predicates: ResolvedPredicate[],
    from: Date,
    to: Date,
    take: number,
  ) {
    return prisma.issue.findMany({
      where: {
        ...issueFilterWhere({ projectIds: [projectId] }, filter, predicates),
        // BR-1: a due date is the minimum for an event. Nothing without one is
        // ever given a guessed cell.
        dueDate: { not: null, gte: from },
        OR: [
          // Starts inside or before the window and is still due within it.
          { startDate: { lte: to } },
          // No start at all: the one-day case, keyed off the due date.
          { startDate: null, dueDate: { lte: to } },
        ],
      },
      select: eventSelect,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: take + 1,
    });
  },

  /** Undated issues for the drag-onto-a-day panel (BR-7). */
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
      select: eventSelect,
      orderBy: [{ rank: "asc" }, { id: "asc" }],
      take,
    });
  },
};
