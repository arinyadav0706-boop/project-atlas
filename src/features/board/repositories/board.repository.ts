import { prisma } from "@/shared/lib/db";
// One filter language for every project list view — see issue-filter.repository.ts.
import { issueFilterWhere } from "@/features/issues/repositories/issue-filter.repository";
// One card shape for every list surface — see issue-card.repository.ts.
import { issueCardSelect } from "@/features/issues/repositories/issue-card.repository";
import type { BoardFilter } from "@/features/board/types/board.types";

// Prisma is imported ONLY in *.repository.ts. The board reads the Issue table
// filtered by (projectId + BoardFilter), grouped by status, ordered by `rank`.

// Each column is bounded — never return an unbounded set (Performance doc,
// standard #1).
//
// It used to be bounded by a hard cap of 100 with **no way to see past it**:
// card 101 in a column existed, counted in the column header, and could not be
// reached from the board at all. The count made that worse rather than better,
// because "137" beside a list of 100 is a number the reader has no way to
// reconcile. That was tracked as UX-5 and is now closed — the cap is a PAGE,
// and a column with more says so and can load it.
export const BOARD_COLUMN_PAGE = 50;
/** Ceiling on an explicitly requested page size, as everywhere else. */
export const BOARD_COLUMN_LIMIT = 100;


export const BoardRepository = {
  // Cards for one column, ordered by rank. A column is a STATUS ID now
  // (30_workflow BR-5) — a project may have three columns in the same category,
  // and grouping by category would merge them into one.
  //
  // Keyset, like every other list in the product: `take + 1` answers "is there
  // more" without a second query, and the cursor is the card id. Deliberately
  // NOT an offset — a board column is the one place someone drags rows around
  // while paging through it, and offsets shift under exactly that.
  columnItems(
    projectId: string,
    statusId: string,
    filter: BoardFilter,
    page: { cursor?: string; take: number } = { take: BOARD_COLUMN_PAGE },
  ) {
    return prisma.issue.findMany({
      where: { ...issueFilterWhere({ projectIds: [projectId] }, filter), statusId },
      select: issueCardSelect,
      orderBy: [{ rank: "asc" }, { id: "asc" }],
      take: page.take + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
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
