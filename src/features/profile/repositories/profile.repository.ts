import { prisma } from "@/shared/lib/db";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §2).
// Every method is scoped to a single user's own row, except the org-scoped
// avatar existence check used by the serving route (16_profile.md BR-4/BR-5).

const profileSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  notificationsEnabled: true,
  orgRole: true,
  organizationId: true,
} as const;

export const ProfileRepository = {
  findById(userId: string) {
    return prisma.user.findUnique({ where: { id: userId }, select: profileSelect });
  },

  // The caller's project memberships (read-only access summary, BR-3). Scoped to
  // the caller's org and non-deleted projects; ordered by project name.
  listMemberships(userId: string, organizationId: string) {
    return prisma.projectMember.findMany({
      where: {
        userId,
        deletedAt: null,
        project: { organizationId, deletedAt: null },
      },
      select: {
        role: true,
        project: { select: { id: true, key: true, name: true } },
      },
      orderBy: { project: { name: "asc" } },
    });
  },

  update(
    userId: string,
    data: { name?: string; notificationsEnabled?: boolean; avatarUrl?: string | null },
    actorId: string,
  ) {
    return prisma.user.update({
      where: { id: userId },
      data: { ...data, updatedBy: actorId },
      select: profileSelect,
    });
  },

  // F-1: resolve a target user's avatar only within the caller's org. Returns
  // null when the user is outside the org (or absent) so the serving route 404s
  // rather than leaking cross-tenant existence.
  findAvatarInOrg(userId: string, organizationId: string) {
    return prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, avatarUrl: true },
    });
  },
};
