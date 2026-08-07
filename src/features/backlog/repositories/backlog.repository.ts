import { prisma } from "@/shared/lib/db";
// The same filter language the Board uses (ADR-0008) — one translation, so the
// two surfaces cannot disagree about what a filter means.
import { issueFilterWhere } from "@/features/issues/repositories/issue-filter.repository";
import { issueCardSelect } from "@/features/issues/repositories/issue-card.repository";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";

// Prisma is imported ONLY in *.repository.ts. The backlog reads the Issue table
// filtered to one project's unscheduled issues (`sprintId = null`), ordered by
// the shared `rank` (ADR-0009/0013) — covered by issues(projectId, sprintId, rank).


// Keyset pagination — never return an unbounded set (Performance doc, standard
// #1). `id` is the final tiebreaker so the order is total and the cursor
// deterministic even if two ranks ever tie across statuses.
export const DEFAULT_BACKLOG_PAGE_SIZE = 50;
export const MAX_BACKLOG_PAGE_SIZE = 100;

export const BacklogRepository = {
  // One page of unscheduled issues ordered by rank. Fetches `take + 1` to let
  // the service detect whether a further page exists.
  listUnscheduled(
    projectId: string,
    filter: IssueFilter = {},
    page: { cursor?: string; take?: number } = {},
  ) {
    const take = Math.min(
      page.take ?? DEFAULT_BACKLOG_PAGE_SIZE,
      MAX_BACKLOG_PAGE_SIZE,
    );
    return prisma.issue.findMany({
      where: backlogWhere(projectId, filter),
      select: issueCardSelect,
      orderBy: [{ rank: "asc" }, { id: "asc" }],
      take: take + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
  },

  // Total under the active filter. The list is keyset-paginated, so without
  // this a filtered backlog could show "50 items" when it means "50 so far".
  countUnscheduled(projectId: string, filter: IssueFilter = {}) {
    return prisma.issue.count({ where: backlogWhere(projectId, filter) });
  },
};

// `sprintId: null` is the backlog's definition, not a filter the caller may
// override — a "backlog" showing sprinted issues would not be a backlog.
function backlogWhere(projectId: string, filter: IssueFilter) {
  // Spread first, then pin `sprintId: null` — so even a caller that passes one
  // cannot widen the backlog into the sprinted set.
  return { ...issueFilterWhere(projectId, filter), sprintId: null };
}
