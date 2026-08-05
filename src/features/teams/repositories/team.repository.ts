import { prisma } from "@/shared/lib/db";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §4).
// RBAC, hierarchy/cycle checks, and audit live in the service.

const memberUserSelect = {
  select: { id: true, name: true, email: true, avatarUrl: true },
} as const;

export const TeamRepository = {
  listByOrg(organizationId: string) {
    return prisma.team.findMany({
      where: { organizationId, deletedAt: null },
      select: {
        id: true,
        name: true,
        parentTeamId: true,
        manager: { select: { id: true, name: true } },
        parentTeam: { select: { name: true } },
        _count: { select: { memberships: true } },
      },
      orderBy: { name: "asc" },
    });
  },

  // Lightweight rows for hierarchy traversal (cycle checks + managed-user set).
  hierarchyRows(organizationId: string) {
    return prisma.team.findMany({
      where: { organizationId, deletedAt: null },
      select: { id: true, parentTeamId: true, managerId: true },
    });
  },

  findById(id: string) {
    return prisma.team.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, organizationId: true, name: true, managerId: true, parentTeamId: true },
    });
  },

  findDetail(id: string) {
    return prisma.team.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        managerId: true,
        parentTeamId: true,
        memberships: { select: { user: memberUserSelect }, orderBy: { createdAt: "asc" } },
      },
    });
  },

  create(input: {
    organizationId: string;
    name: string;
    managerId: string | null;
    parentTeamId: string | null;
    actorId: string;
  }) {
    return prisma.team.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        managerId: input.managerId,
        parentTeamId: input.parentTeamId,
        createdBy: input.actorId,
      },
      select: { id: true },
    });
  },

  update(
    id: string,
    data: { name?: string; managerId?: string | null; parentTeamId?: string | null },
    actorId: string,
  ) {
    return prisma.team.update({
      where: { id },
      data: { ...data, updatedBy: actorId },
      select: { id: true },
    });
  },

  // Soft-delete the team, re-parent its children to its parent, and hard-delete
  // its membership links — in one transaction (BR-6).
  async deleteWithReparent(id: string, newParentId: string | null, actorId: string) {
    await prisma.$transaction([
      prisma.team.updateMany({
        where: { parentTeamId: id },
        data: { parentTeamId: newParentId, updatedBy: actorId },
      }),
      prisma.teamMembership.deleteMany({ where: { teamId: id } }),
      prisma.team.update({
        where: { id },
        data: { deletedAt: new Date(), updatedBy: actorId },
      }),
    ]);
  },

  membershipsByTeamIds(teamIds: string[]) {
    return prisma.teamMembership.findMany({
      where: { teamId: { in: teamIds } },
      select: { userId: true },
    });
  },

  // Add a user to a team; because a user has at most one team (unique userId),
  // this MOVES them if already teamed (upsert on userId).
  addMember(teamId: string, userId: string, actorId: string) {
    return prisma.teamMembership.upsert({
      where: { userId },
      create: { teamId, userId, createdBy: actorId },
      update: { teamId, createdBy: actorId },
      select: { id: true },
    });
  },

  removeMember(teamId: string, userId: string) {
    return prisma.teamMembership.deleteMany({ where: { teamId, userId } });
  },

  // Reports (managed users) with their team name, for the My Team view.
  reportsByUserIds(userIds: string[]) {
    return prisma.teamMembership.findMany({
      where: { userId: { in: userIds } },
      select: { user: memberUserSelect, team: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    });
  },

  // Cheap check for the nav: does this user manage any (live) team?
  async managesAnyTeam(userId: string, organizationId: string): Promise<boolean> {
    const count = await prisma.team.count({
      where: { organizationId, managerId: userId, deletedAt: null },
    });
    return count > 0;
  },

  // Active org users for the manager/member pickers.
  orgUsers(organizationId: string) {
    return prisma.user.findMany({
      where: { organizationId, isActive: true, deletedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  },

  // Confirm a user exists in the org (validating manager/member assignment).
  userInOrg(userId: string, organizationId: string) {
    return prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true },
    });
  },
};
