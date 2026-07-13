import { prisma } from "@/shared/lib/db";
import type { AuthProvider, OrgRole } from "@prisma/client";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §2).
export const UserRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findAuthAccount(provider: AuthProvider, providerAccountId: string) {
    return prisma.authAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId } },
      include: { user: true },
    });
  },

  async linkAuthAccount(userId: string, provider: AuthProvider, providerAccountId: string) {
    return prisma.authAccount.create({
      data: { userId, provider, providerAccountId },
    });
  },

  async createFromProvider(input: {
    organizationId: string;
    email: string;
    name: string;
    avatarUrl?: string | null;
    orgRole?: OrgRole;
  }) {
    return prisma.user.create({
      data: {
        organizationId: input.organizationId,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl ?? null,
        orgRole: input.orgRole ?? "MEMBER",
      },
    });
  },

  updateLastLogin(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  },

  // V1 has exactly one Organization row (Vision §8 A1) — this is the
  // bootstrap lookup used when provisioning a user on first sign-in.
  findDefaultOrganization() {
    return prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  },
};
