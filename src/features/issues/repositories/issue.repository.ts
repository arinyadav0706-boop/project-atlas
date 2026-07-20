import { prisma } from "@/shared/lib/db";
import { rankAppend } from "@/shared/lib/rank";
import type { Prisma, IssueStatus, IssueType } from "@prisma/client";

// Prisma is imported ONLY in *.repository.ts files. Key generation reads
// and increments the owning Project row in the same transaction, so keys
// are unique and never reused (docs/02_Modules/04_issues.md BR-1).

const assigneeSelect = {
  select: { id: true, name: true, avatarUrl: true },
} as const;

const listSelect = {
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
  assignee: assigneeSelect,
} as const;

// Keyset pagination: never return an unbounded result set. `id` is the final
// tiebreaker so the ordering is total and the cursor is deterministic.
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

function issueWhere(
  projectId: string,
  filters: { status?: IssueStatus; assigneeId?: string; type?: IssueType },
) {
  return {
    projectId,
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    ...(filters.type ? { type: filters.type } : {}),
  };
}

export const IssueRepository = {
  listByProject(
    projectId: string,
    filters: { status?: IssueStatus; assigneeId?: string; type?: IssueType },
    page: { cursor?: string; take?: number } = {},
  ) {
    const take = Math.min(page.take ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    return prisma.issue.findMany({
      where: issueWhere(projectId, filters),
      select: listSelect,
      orderBy: [
        { status: "asc" },
        { rank: "asc" },
        { createdAt: "desc" },
        { id: "asc" },
      ],
      // Fetch one extra row to detect whether a further page exists.
      take: take + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
  },

  // Per-status totals for the filter chips — independent of the current
  // status filter and of pagination, so the counts stay stable as you page.
  countByStatus(
    projectId: string,
    filters: { assigneeId?: string; type?: IssueType } = {},
  ) {
    return prisma.issue.groupBy({
      by: ["status"],
      where: issueWhere(projectId, filters),
      _count: { _all: true },
    });
  },

  findDetail(id: string) {
    return prisma.issue.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignee: assigneeSelect,
        reporter: assigneeSelect,
      },
    });
  },

  findEpic(projectId: string, epicId: string) {
    return prisma.issue.findFirst({
      where: { id: epicId, projectId, type: "EPIC", deletedAt: null },
      select: { id: true },
    });
  },

  async createWithKey(input: {
    projectId: string;
    type: IssueType;
    title: string;
    description: string | null;
    priority: Prisma.IssueCreateInput["priority"];
    assigneeId: string | null;
    reporterId: string;
    epicId: string | null;
    storyPoints: number | null;
    dueDate: Date | null;
    creatorId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id: input.projectId },
        data: { issueKeyCounter: { increment: 1 } },
        select: { key: true, issueKeyCounter: true },
      });
      const key = `${project.key}-${project.issueKeyCounter}`;
      // New issues land in the TODO column (the schema default). Append after
      // its current last card by generating a rank between that last key and
      // the open end — one row, no rebalance (ADR-0009).
      const last = await tx.issue.findFirst({
        where: { projectId: input.projectId, status: "TODO", deletedAt: null },
        orderBy: { rank: "desc" },
        select: { rank: true },
      });
      return tx.issue.create({
        data: {
          projectId: input.projectId,
          key,
          type: input.type,
          title: input.title,
          description: input.description,
          priority: input.priority,
          assigneeId: input.assigneeId,
          reporterId: input.reporterId,
          epicId: input.epicId,
          storyPoints: input.storyPoints,
          dueDate: input.dueDate,
          rank: rankAppend(last?.rank ?? null, input.creatorId),
          createdBy: input.creatorId,
        },
        include: { assignee: assigneeSelect, reporter: assigneeSelect },
      });
    });
  },

  // Version-checked edit (ADR-0011): applies only if the issue is still at
  // `expectedVersion`; returns the updated detail row, or null on a lost update
  // (someone else changed it since the client loaded the form).
  async updateWithVersion(
    id: string,
    expectedVersion: number,
    data: Prisma.IssueUncheckedUpdateInput,
    actorId: string,
  ) {
    const result = await prisma.issue.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...data, version: { increment: 1 }, updatedBy: actorId },
    });
    if (result.count === 0) return null;
    return IssueRepository.findDetail(id);
  },

  // Version-checked status transition (ADR-0011). Null on a lost update.
  async setStatusWithVersion(
    id: string,
    expectedVersion: number,
    status: IssueStatus,
    actorId: string,
  ) {
    const result = await prisma.issue.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { status, version: { increment: 1 }, updatedBy: actorId },
    });
    if (result.count === 0) return null;
    return IssueRepository.findDetail(id);
  },

  // Reorder neighbour lookup: the rank of a card that must live in the given
  // project + status column (non-deleted). Returns null if it doesn't — the
  // service treats that as an invalid/stale neighbour (never trust the client).
  findRankInColumn(id: string, projectId: string, status: IssueStatus) {
    return prisma.issue.findFirst({
      where: { id, projectId, status, deletedAt: null },
      select: { id: true, rank: true },
    });
  },

  // Backlog reorder neighbour lookup (ADR-0013): the rank of a card that must
  // live in the same project and be unscheduled (`sprintId = null`). The backlog
  // is a single flat list across statuses, so — unlike the board — status is not
  // part of the scope. Returns null for a stale/invalid neighbour.
  findRankInBacklog(id: string, projectId: string) {
    return prisma.issue.findFirst({
      where: { id, projectId, sprintId: null, deletedAt: null },
      select: { id: true, rank: true },
    });
  },

  // Single-row reorder write (ADR-0009) guarded by optimistic concurrency
  // (ADR-0011): applies only if the row is still at `expectedVersion`. Returns
  // the updated detail row, or null if the version no longer matches (a lost
  // update — someone else changed the card since the client read it).
  async reorderWithVersion(
    id: string,
    expectedVersion: number,
    data: { rank: string; status?: IssueStatus },
    actorId: string,
  ) {
    const result = await prisma.issue.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        rank: data.rank,
        ...(data.status ? { status: data.status } : {}),
        version: { increment: 1 },
        updatedBy: actorId,
      },
    });
    if (result.count === 0) return null;
    return IssueRepository.findDetail(id);
  },

  softDelete(id: string, actorId: string) {
    return prisma.issue.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 }, updatedBy: actorId },
    });
  },
};
