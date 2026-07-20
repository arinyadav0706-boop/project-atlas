import { prisma } from "@/shared/lib/db";
import type { IssueStatus, Prisma } from "@prisma/client";
import type { BoardFilter } from "@/features/board/types/board.types";

// Prisma is imported ONLY in *.repository.ts. The board reads the Issue table
// filtered by (projectId + BoardFilter), grouped by status, ordered by `rank`.

// Each column is bounded — never return an unbounded set (Performance doc,
// standard #1). Per-column "load more" for very large columns is future
// (UX-5); at the cap the lowest-ranked tail is omitted.
export const BOARD_COLUMN_LIMIT = 100;

const cardSelect = {
  id: true,
  projectId: true,
  key: true,
  type: true,
  title: true,
  status: true,
  priority: true,
  storyPoints: true,
  updatedAt: true,
  version: true,
  assignee: { select: { id: true, name: true, avatarUrl: true } },
} as const;

// One place translates the whole composable filter to a Prisma `where`. Adding
// a filter here is the only change a new BoardFilter field needs (ADR-0008).
function boardWhere(projectId: string, filter: BoardFilter): Prisma.IssueWhereInput {
  return {
    projectId,
    deletedAt: null,
    ...(filter.assigneeId ? { assigneeId: filter.assigneeId } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.priority ? { priority: filter.priority } : {}),
    ...(filter.sprintId ? { sprintId: filter.sprintId } : {}),
    ...(filter.epicId ? { epicId: filter.epicId } : {}),
    ...(filter.labelIds?.length
      ? { labels: { some: { labelId: { in: filter.labelIds } } } }
      : {}),
    ...(filter.search
      ? { title: { contains: filter.search, mode: "insensitive" } }
      : {}),
  };
}

export const BoardRepository = {
  // Cards for one status column, ordered by rank. Uses the covering index
  // issues(projectId, status, rank); `id` is the final tiebreaker for a total,
  // stable order (ranks are unique per column but this stays safe regardless).
  columnItems(projectId: string, status: IssueStatus, filter: BoardFilter) {
    return prisma.issue.findMany({
      where: { ...boardWhere(projectId, filter), status },
      select: cardSelect,
      orderBy: [{ rank: "asc" }, { id: "asc" }],
      take: BOARD_COLUMN_LIMIT,
    });
  },

  // Per-status totals under the active filter — accurate even though each
  // column is capped.
  countByStatus(projectId: string, filter: BoardFilter) {
    return prisma.issue.groupBy({
      by: ["status"],
      where: boardWhere(projectId, filter),
      _count: { _all: true },
    });
  },
};
