import { prisma } from "@/shared/lib/db";

// Prisma is imported ONLY in *.repository.ts. The backlog reads the Issue table
// filtered to one project's unscheduled issues (`sprintId = null`), ordered by
// the shared `rank` (ADR-0009/0013) — covered by issues(projectId, sprintId, rank).

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
    page: { cursor?: string; take?: number } = {},
  ) {
    const take = Math.min(
      page.take ?? DEFAULT_BACKLOG_PAGE_SIZE,
      MAX_BACKLOG_PAGE_SIZE,
    );
    return prisma.issue.findMany({
      where: { projectId, sprintId: null, deletedAt: null },
      select: cardSelect,
      orderBy: [{ rank: "asc" }, { id: "asc" }],
      take: take + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
  },
};
