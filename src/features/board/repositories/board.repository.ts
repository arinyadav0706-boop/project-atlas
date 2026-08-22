import { prisma } from "@/shared/lib/db";
// One filter language for every project list view — see issue-filter.repository.ts.
import { issueFilterWhere } from "@/features/issues/repositories/issue-filter.repository";
// One card shape for every list surface — see issue-card.repository.ts.
import { issueCardSelect } from "@/features/issues/repositories/issue-card.repository";
import type { BoardFilter } from "@/features/board/types/board.types";

// Prisma is imported ONLY in *.repository.ts. The board reads the Issue table
// filtered by (projectId + BoardFilter), grouped by status, ordered by `rank`.

// Each column is bounded — never return an unbounded set (Performance doc,
// standard #1). Per-column "load more" for very large columns is future
// (UX-5); at the cap the lowest-ranked tail is omitted.
export const BOARD_COLUMN_LIMIT = 100;


export const BoardRepository = {
  // Cards for one column, ordered by rank. A column is a STATUS ID now
  // (30_workflow BR-5) — a project may have three columns in the same category,
  // and grouping by category would merge them into one.
  columnItems(projectId: string, statusId: string, filter: BoardFilter) {
    return prisma.issue.findMany({
      where: { ...issueFilterWhere({ projectIds: [projectId] }, filter), statusId },
      select: issueCardSelect,
      orderBy: [{ rank: "asc" }, { id: "asc" }],
      take: BOARD_COLUMN_LIMIT,
    });
  },

  // Per-column totals under the active filter — accurate even though each
  // column is capped.
  countByStatusId(projectId: string, filter: BoardFilter) {
    return prisma.issue.groupBy({
      by: ["statusId"],
      where: issueFilterWhere({ projectIds: [projectId] }, filter),
      _count: { _all: true },
    });
  },

  // Per-CATEGORY totals, for the filter chips that still speak in categories.
  countByCategory(projectId: string, filter: BoardFilter) {
    return prisma.issue.groupBy({
      by: ["status"],
      where: issueFilterWhere({ projectIds: [projectId] }, filter),
      _count: { _all: true },
    });
  },
};
