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
