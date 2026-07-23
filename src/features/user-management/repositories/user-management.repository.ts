import { prisma } from "@/shared/lib/db";
import type { Prisma, OrgRole } from "@prisma/client";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §2).
// All queries are org-scoped by the caller (F-1).

export interface UserListFilters {
  organizationId: string;
  q?: string;
  role?: OrgRole;
  status?: "active" | "inactive";
  skip: number;
  take: number;
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  orgRole: true,
  isActive: true,
  lastLoginAt: true,
  passwordHash: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export const UserManagementRepository = {
  async list(filters: UserListFilters) {
    const where: Prisma.UserWhereInput = {
      organizationId: filters.organizationId,
      deletedAt: null,
      ...(filters.role ? { orgRole: filters.role } : {}),
      ...(filters.status ? { isActive: filters.status === "active" } : {}),
      ...(filters.q
        ? {
            OR: [
              { name: { contains: filters.q, mode: "insensitive" } },
              { email: { contains: filters.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: userSelect,
        orderBy: [{ createdAt: "desc" }],
        skip: filters.skip,
        take: filters.take,
      }),
      prisma.user.count({ where }),
    ]);
    return { rows, total };
  },

  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email }, select: userSelect });
  },

  // Org-scoped by-id (F-1) — returns null for another tenant's user.
  findInOrg(organizationId: string, userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
      select: userSelect,
    });
  },

  invite(input: {
    organizationId: string;
    email: string;
    name: string;
    orgRole: OrgRole;
    actorId: string;
  }) {
    return prisma.user.create({
      data: {
        organizationId: input.organizationId,
        email: input.email,
        name: input.name,
        orgRole: input.orgRole,
        isActive: true,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
      select: userSelect,
    });
  },

  update(
    userId: string,
    data: { orgRole?: OrgRole; isActive?: boolean; actorId: string },
  ) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.orgRole !== undefined ? { orgRole: data.orgRole } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedBy: data.actorId,
      },
      select: userSelect,
    });
  },

  // Count of OTHER active admins (excluding the target) — the last-admin guard
  // (BR-5). If this is 0, the target is the last active admin.
  countOtherActiveAdmins(organizationId: string, excludeUserId: string) {
    return prisma.user.count({
      where: {
        organizationId,
        orgRole: "ADMIN",
        isActive: true,
        deletedAt: null,
        id: { not: excludeUserId },
      },
    });
  },
};
