import { prisma } from "@/shared/lib/db";

// Prisma is imported ONLY in *.repository.ts. Home reads existing entities
// (issues/projects) scoped to the caller; personalization tables have their own
// repositories. Every read here is bounded.

// Shape matching IssueListItemDto (see issues/types) so the service maps 1:1.
const issueCardSelect = {
  id: true,
  projectId: true,
  key: true,
  type: true,
  title: true,
  status: true,
  priority: true,
  storyPoints: true,
  dueDate: true,
  updatedAt: true,
  version: true,
  assignee: { select: { id: true, name: true, avatarUrl: true } },
} as const;

// A safety bound, not a page size: one person finishing more than this many
// issues in 30 days is not a real workload, so below it the count is exact.
const COMPLETED_CANDIDATE_CAP = 1000;

export const HomeRepository = {
  // Active projects in the caller's org that they are a member of — the scope
  // for every personal section (BR-7).
  memberProjectIds(organizationId: string, userId: string) {
    return prisma.projectMember.findMany({
      where: {
        userId,
        deletedAt: null,
        project: { organizationId, status: "ACTIVE", deletedAt: null },
      },
      select: { projectId: true },
    });
  },

  // BR-1: my open assigned work, across projects, due/priority ordered.
  myWork(projectIds: string[], userId: string, take: number) {
    return prisma.issue.findMany({
      where: {
        projectId: { in: projectIds },
        assigneeId: userId,
        deletedAt: null,
        status: { not: "DONE" },
      },
      select: issueCardSelect,
      orderBy: [
        { dueDate: { sort: "asc", nulls: "last" } },
        { priority: "desc" },
        { updatedAt: "desc" },
        { id: "asc" },
      ],
      take,
    });
  },

  // BR-4: my time-sensitive items (due within the window, plus overdue).
  dueSoon(projectIds: string[], userId: string, before: Date, take: number) {
    return prisma.issue.findMany({
      where: {
        projectId: { in: projectIds },
        assigneeId: userId,
        deletedAt: null,
        status: { not: "DONE" },
        dueDate: { lte: before },
      },
      select: issueCardSelect,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take,
    });
  },

  // BR-11: the rest of Your focus once nothing more is due — my open work with
  // no near due date, most urgent first. The due-soon rows are excluded by the
  // date condition itself, so the two reads can never return the same issue.
  focusFill(projectIds: string[], userId: string, after: Date, take: number) {
    return prisma.issue.findMany({
      where: {
        projectId: { in: projectIds },
        assigneeId: userId,
        deletedAt: null,
        status: { not: "DONE" },
        OR: [{ dueDate: null }, { dueDate: { gt: after } }],
      },
      select: issueCardSelect,
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
      take,
    });
  },

  // BR-10: the Summary row. Counts over one person's issues, in parallel — the
  // browser makes one request for the row, never one per tile.
  async summaryCounts(projectIds: string[], userId: string, dueBefore: Date) {
    const mine = { projectId: { in: projectIds }, assigneeId: userId, deletedAt: null };
    const open = { ...mine, status: { not: "DONE" as const } };
    const [openCount, dueThisWeek, inProgress, inReview, blocked] = await Promise.all([
      prisma.issue.count({ where: open }),
      prisma.issue.count({ where: { ...open, dueDate: { lte: dueBefore } } }),
      prisma.issue.count({ where: { ...mine, status: "IN_PROGRESS" } }),
      prisma.issue.count({ where: { ...mine, status: "IN_REVIEW" } }),
      // The same predicate as the issue filter's `blocked` (ADR-0046 §3): a
      // blocker that is finished or deleted no longer blocks.
      prisma.issue.count({
        where: {
          ...open,
          linksIn: {
            some: { type: "BLOCKS", source: { deletedAt: null, status: { not: "DONE" } } },
          },
        },
      }),
    ]);
    return { open: openCount, dueThisWeek, inProgress, inReview, blocked };
  },

  // BR-10 "Completed (30 days)". Issue has no completed-at column, so the audit
  // log is the record of when something entered DONE. Candidates are my DONE
  // issues touched in the window (a transition bumps updatedAt), which keeps the
  // audit read to ids that can possibly match.
  async completedSince(projectIds: string[], userId: string, since: Date) {
    const candidates = await prisma.issue.findMany({
      where: {
        projectId: { in: projectIds },
        assigneeId: userId,
        deletedAt: null,
        status: "DONE",
        updatedAt: { gte: since },
      },
      select: { id: true },
      take: COMPLETED_CANDIDATE_CAP,
    });
    if (candidates.length === 0) return 0;
    const rows = await prisma.auditLog.findMany({
      where: {
        entityType: "Issue",
        action: "ISSUE_STATUS_CHANGED",
        entityId: { in: candidates.map((c) => c.id) },
        createdAt: { gte: since },
        // The category, not the name: projects rename their Done column.
        afterData: { path: ["category"], equals: "DONE" },
      },
      select: { entityId: true },
      distinct: ["entityId"],
    });
    return rows.length;
  },

  // Live issues for "Continue working" candidate ids, scoped + not done. Order
  // is re-applied by the engagement score in the service.
  issuesByIds(ids: string[], projectIds: string[]) {
    return prisma.issue.findMany({
      where: {
        id: { in: ids },
        projectId: { in: projectIds },
        deletedAt: null,
        status: { not: "DONE" },
      },
      select: issueCardSelect,
    });
  },

  // Candidates for the "assigned & changed since I looked" attention source.
  attentionCandidates(projectIds: string[], userId: string, take: number) {
    return prisma.issue.findMany({
      where: {
        projectId: { in: projectIds },
        assigneeId: userId,
        deletedAt: null,
        status: { not: "DONE" },
      },
      select: {
        id: true,
        key: true,
        title: true,
        projectId: true,
        updatedAt: true,
        updatedBy: true,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take,
    });
  },

  // Lean project rows for the Home strip, scoped to active + in-org.
  projectsByIds(ids: string[], organizationId: string) {
    return prisma.project.findMany({
      where: { id: { in: ids }, organizationId, status: "ACTIVE", deletedAt: null },
      select: { id: true, key: true, name: true, description: true },
    });
  },
};
