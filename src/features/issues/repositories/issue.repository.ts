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
        // Parent epic summary in the same round-trip (no N+1) — ADR-0026.
        epic: { select: { id: true, key: true, title: true } },
      },
    });
  },

  // A project's epics for selectors + the board Epic filter (ADR-0026). Lean
  // summary, newest first so recent epics surface at the top of the picker.
  listEpics(projectId: string) {
    return prisma.issue.findMany({
      where: { projectId, type: "EPIC", deletedAt: null },
      select: { id: true, key: true, title: true },
      orderBy: [{ createdAt: "desc" }],
    });
  },

  // An epic's child issues for the detail hierarchy section (ADR-0026). Bounded
  // to one epic's children; ordered by rank so it reads like the board/backlog.
  listChildren(epicId: string) {
    return prisma.issue.findMany({
      where: { epicId, deletedAt: null },
      select: { id: true, key: true, title: true, type: true, status: true },
      orderBy: [{ rank: "asc" }, { id: "asc" }],
    });
  },

  // Detach an epic's children on delete (ADR-0026 §2): epicId → null, never a
  // cascade, never an orphan. Bumps version like any mutation (ADR-0011).
  detachChildren(epicId: string, actorId: string) {
    return prisma.issue.updateMany({
      where: { epicId, deletedAt: null },
      data: { epicId: null, version: { increment: 1 }, updatedBy: actorId },
    });
  },

  // Lean lookup for sibling features (e.g. Comments) that need the owning
  // project for tenant scope / RBAC without the full detail include.
  findProjectId(id: string) {
    return prisma.issue.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, projectId: true },
    });
  },

  // projectId + current estimate, for the time-tracking summary (ADR-0030).
  findProjectAndEstimate(id: string) {
    return prisma.issue.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, projectId: true, estimateMinutes: true },
    });
  },

  // Set/clear the estimate (time-tracking, BR-5). Deliberately NOT OCC-bound to
  // the issue-edit version — estimate is orthogonal to the edit path.
  setEstimate(id: string, estimateMinutes: number | null, actorId: string) {
    return prisma.issue.update({
      where: { id },
      data: { estimateMinutes, updatedBy: actorId },
      select: { id: true, estimateMinutes: true },
    });
  },

  // Batch id -> projectId, for building links to many issues at once (e.g. the
  // notification list resolves each ISSUE notification's detail-page URL).
  findProjectIdsByIds(ids: string[]) {
    return prisma.issue.findMany({
      where: { id: { in: ids } },
      select: { id: true, projectId: true },
    });
  },

  // Lean context for fanning out a notification about an issue (ADR-0019) —
  // the display key/title and the recipients (assignee + reporter).
  findNotificationContext(id: string) {
    return prisma.issue.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, key: true, title: true, assigneeId: true, reporterId: true },
    });
  },

  // Component default-assignee routing (18_components.md BR-3): assign the issue
  // only if it currently has no assignee — atomic (the `assigneeId: null` guard
  // is in the WHERE), so it never overwrites an existing assignee. Bumps version
  // like any mutation (ADR-0011). Returns the number of rows changed (0 or 1).
  assignIfUnassigned(issueId: string, userId: string, actorId: string) {
    return prisma.issue.updateMany({
      where: { id: issueId, assigneeId: null, deletedAt: null },
      data: { assigneeId: userId, version: { increment: 1 }, updatedBy: actorId },
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
        include: {
          assignee: assigneeSelect,
          reporter: assigneeSelect,
          epic: { select: { id: true, key: true, title: true } },
        },
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

  // Sprint move neighbour lookup (ADR-0014): the rank of a card that must live in
  // the same project and the given sprint. Returns null for a stale/invalid
  // neighbour (never trusted from the client).
  findRankInSprint(id: string, projectId: string, sprintId: string) {
    return prisma.issue.findFirst({
      where: { id, projectId, sprintId, deletedAt: null },
      select: { id: true, rank: true },
    });
  },

  // Sprint membership move (ADR-0014) guarded by optimistic concurrency
  // (ADR-0011): sets `sprintId` (a sprint, or null for the backlog) AND the
  // destination `rank` in one row write. Null if the version no longer matches.
  async moveToSprintWithVersion(
    id: string,
    expectedVersion: number,
    data: { sprintId: string | null; rank: string; epicId?: string | null },
    actorId: string,
  ) {
    const result = await prisma.issue.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        sprintId: data.sprintId,
        rank: data.rank,
        // Only reassign the parent epic when the move explicitly carries one
        // (a group-by-epic drop out of a sprint); otherwise the epic is left
        // unchanged (an issue keeps its epic while in a sprint) — ADR-0026.
        ...(data.epicId !== undefined ? { epicId: data.epicId } : {}),
        version: { increment: 1 },
        updatedBy: actorId,
      },
    });
    if (result.count === 0) return null;
    return IssueRepository.findDetail(id);
  },

  // Single-row reorder write (ADR-0009) guarded by optimistic concurrency
  // (ADR-0011): applies only if the row is still at `expectedVersion`. Returns
  // the updated detail row, or null if the version no longer matches (a lost
  // update — someone else changed the card since the client read it).
  async reorderWithVersion(
    id: string,
    expectedVersion: number,
    data: { rank: string; status?: IssueStatus; epicId?: string | null },
    actorId: string,
  ) {
    const result = await prisma.issue.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: {
        rank: data.rank,
        ...(data.status ? { status: data.status } : {}),
        // Group-by-epic backlog drop reassigns the parent in the same write
        // (ADR-0026); omitted for ordinary reorders so the epic is untouched.
        ...(data.epicId !== undefined ? { epicId: data.epicId } : {}),
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
