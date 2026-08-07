import { prisma } from "@/shared/lib/db";
// One filter language for every project list view — see issue-filter.repository.ts.
import { issueFilterWhere } from "@/features/issues/repositories/issue-filter.repository";
import type { IssueStatus } from "@prisma/client";
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
  // Parent epic key for the card's epic badge (ADR-0026).
  epic: { select: { id: true, key: true } },
  // Classification chips (ADR-0018) — only live labels/components.
  labels: {
    where: { label: { deletedAt: null } },
    select: { label: { select: { id: true, name: true, color: true } } },
  },
  components: {
    where: { component: { deletedAt: null } },
    select: { component: { select: { id: true, name: true } } },
  },
} as const;

export const BoardRepository = {
  // Cards for one status column, ordered by rank. Uses the covering index
  // issues(projectId, status, rank); `id` is the final tiebreaker for a total,
  // stable order (ranks are unique per column but this stays safe regardless).
  columnItems(projectId: string, status: IssueStatus, filter: BoardFilter) {
    return prisma.issue.findMany({
      where: { ...issueFilterWhere(projectId, filter), status },
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
      where: issueFilterWhere(projectId, filter),
      _count: { _all: true },
    });
  },
};
