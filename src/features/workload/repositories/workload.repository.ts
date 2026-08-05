import { prisma } from "@/shared/lib/db";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §4).
// Scope/RBAC and all arithmetic live in the service + lib/capacity.

export const WorkloadRepository = {
  // The org's working week — the basis of every capacity figure (ADR-0034).
  workingWeek(organizationId: string) {
    return prisma.organization.findUnique({
      where: { id: organizationId },
      select: { workingMinutesPerDay: true, workingDaysPerWeek: true },
    });
  },

  // Teams in the org with their direct-member counts, for the picker.
  teamsWithCounts(organizationId: string, teamIds?: string[]) {
    return prisma.team.findMany({
      where: {
        organizationId,
        deletedAt: null,
        ...(teamIds ? { id: { in: teamIds } } : {}),
      },
      select: { id: true, name: true, _count: { select: { memberships: true } } },
      orderBy: { name: "asc" },
    });
  },

  findTeam(teamId: string) {
    return prisma.team.findFirst({
      where: { id: teamId, deletedAt: null },
      select: { id: true, organizationId: true, name: true },
    });
  },

  // Direct members of one team (BR-7), active accounts only.
  teamMembers(teamId: string) {
    return prisma.teamMembership.findMany({
      where: { teamId, user: { isActive: true, deletedAt: null } },
      select: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { user: { name: "asc" } },
    });
  },

  // Direct-member user ids across several teams, in one query (scope checks).
  memberUserIdsByTeams(teamIds: string[]) {
    return prisma.teamMembership.findMany({
      where: { teamId: { in: teamIds } },
      select: { userId: true },
    });
  },

  userInOrg(userId: string, organizationId: string) {
    return prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
      select: { id: true },
    });
  },

  // Open issues (BR-2) assigned to these people, across every live project in
  // the organization (BR-3). Minimal columns — this is an aggregation input.
  openIssuesForUsers(userIds: string[], organizationId: string) {
    return prisma.issue.findMany({
      where: {
        assigneeId: { in: userIds },
        status: { not: "DONE" },
        deletedAt: null,
        project: { organizationId, deletedAt: null },
      },
      select: { id: true, assigneeId: true, estimateMinutes: true },
    });
  },

  // Logged minutes per issue for the issues we just fetched.
  loggedByIssue(issueIds: string[]) {
    return prisma.workLog.groupBy({
      by: ["issueId"],
      where: { issueId: { in: issueIds }, deletedAt: null },
      _sum: { minutes: true },
    });
  },

  // The person drill-in (BR-11): their open issues with project context.
  openIssuesForUserDetailed(userId: string, organizationId: string, take: number) {
    return prisma.issue.findMany({
      where: {
        assigneeId: userId,
        status: { not: "DONE" },
        deletedAt: null,
        project: { organizationId, deletedAt: null },
      },
      select: {
        id: true,
        key: true,
        title: true,
        type: true,
        status: true,
        priority: true,
        dueDate: true,
        estimateMinutes: true,
        project: { select: { id: true, key: true, name: true } },
      },
      // A stable, cheap DB-side order; the service re-sorts by remaining effort
      // once logged time is known (that can't be expressed in this query).
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take,
    });
  },
};
