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
  project: { select: { name: true } },
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

  // BR-13 "Reported by me": the BR-1 query, keyed on the reporter.
  myReported(projectIds: string[], userId: string, take: number) {
    return prisma.issue.findMany({
      where: {
        projectId: { in: projectIds },
        reporterId: userId,
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

  // BR-13 "Mentioned": issue ids in most-recent-mention order, possibly
  // repeated (several mentions on one issue). The service dedupes; `take` is
  // the number of mentions read, not issues.
  async mentionedIssueIds(projectIds: string[], userId: string, take: number) {
    const rows = await prisma.commentMention.findMany({
      where: {
        userId,
        deletedAt: null,
        comment: {
          deletedAt: null,
          issue: { projectId: { in: projectIds }, deletedAt: null, status: { not: "DONE" } },
        },
      },
      select: { comment: { select: { issueId: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take,
    });
    return rows.map((r) => r.comment.issueId);
  },

  // BR-14: the issues whose activity is "about my work" — assigned to me or
  // reported by me — most recently touched first, capped so the event reads
  // below always get a bounded IN list.
  activityCandidates(projectIds: string[], userId: string, take: number) {
    return prisma.issue.findMany({
      where: {
        projectId: { in: projectIds },
        deletedAt: null,
        OR: [{ assigneeId: userId }, { reporterId: userId }],
      },
      select: { id: true, key: true, title: true, projectId: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take,
    });
  },

  // BR-14 comments: everyone's but mine. A rule's comment has no author, and
  // `authorId <> me` alone would drop it (SQL NULL never compares unequal).
  recentComments(issueIds: string[], userId: string, since: Date, take: number) {
    return prisma.comment.findMany({
      where: {
        issueId: { in: issueIds },
        deletedAt: null,
        createdAt: { gte: since },
        OR: [{ authorId: null }, { authorId: { not: userId } }],
      },
      select: {
        id: true,
        issueId: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take,
    });
  },

  // BR-14 status changes and reassignments, from the audit trail.
  recentIssueEvents(
    issueIds: string[],
    userId: string,
    since: Date,
    actions: ("ISSUE_STATUS_CHANGED" | "ISSUE_ASSIGNEE_CHANGED")[],
    take: number,
  ) {
    return prisma.auditLog.findMany({
      where: {
        entityType: "Issue",
        action: { in: actions },
        entityId: { in: issueIds },
        createdAt: { gte: since },
        OR: [{ actorId: null }, { actorId: { not: userId } }],
      },
      select: { id: true, action: true, entityId: true, actorId: true, afterData: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take,
    });
  },

  usersByIds(ids: string[], organizationId: string) {
    return prisma.user.findMany({
      where: { id: { in: ids }, organizationId },
      select: { id: true, name: true, avatarUrl: true },
    });
  },

  // BR-15: three grouped reads for the whole strip, whatever its length.
  async projectStats(projectIds: string[]) {
    const [byStatus, activeSprints, members] = await Promise.all([
      prisma.issue.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projectIds }, deletedAt: null },
        _count: { _all: true },
      }),
      prisma.sprint.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds }, status: "ACTIVE", deletedAt: null },
        _count: { _all: true },
      }),
      prisma.projectMember.groupBy({
        by: ["projectId"],
        where: { projectId: { in: projectIds }, deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    return { byStatus, activeSprints, members };
  },

  // BR-16: my open issues due between now and the end of the window.
  upcomingDue(projectIds: string[], userId: string, from: Date, to: Date, take: number) {
    return prisma.issue.findMany({
      where: {
        projectId: { in: projectIds },
        assigneeId: userId,
        deletedAt: null,
        status: { not: "DONE" },
        dueDate: { gte: from, lte: to },
      },
      select: { id: true, key: true, title: true, projectId: true, dueDate: true },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take,
    });
  },

  // BR-16: sprints starting (planned) or ending (active) inside the window.
  upcomingSprints(projectIds: string[], from: Date, to: Date, take: number) {
    return prisma.sprint.findMany({
      where: {
        projectId: { in: projectIds },
        deletedAt: null,
        project: { deletedAt: null },
        OR: [
          { status: "PLANNED", startDate: { gte: from, lte: to } },
          { status: "ACTIVE", endDate: { gte: from, lte: to } },
        ],
      },
      select: {
        id: true,
        name: true,
        status: true,
        startDate: true,
        endDate: true,
        project: { select: { id: true, key: true, name: true } },
      },
      orderBy: [{ startDate: "asc" }, { id: "asc" }],
      take,
    });
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
