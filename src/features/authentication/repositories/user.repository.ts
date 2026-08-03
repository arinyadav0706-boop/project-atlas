import { prisma } from "@/shared/lib/db";
import type { AuthProvider, OrgRole } from "@prisma/client";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §2).
export const UserRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  // Fallback for sessions whose JWT predates organizationId being stored on
  // the token (see getActor) — avoids logging existing users out.
  findOrganizationId(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
  },

  // Live account state, re-read on every authenticated request so session
  // revocation and role changes take effect immediately (F2, ADR-0029) — not
  // only when a 30-day JWT happens to expire. PK lookup, request-cached.
  findActorState(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { isActive: true, orgRole: true, organizationId: true },
    });
  },

  // The identity claims mirrored into the JWT so the top bar reflects a profile
  // edit without a re-login (ADR-0027) — re-read on the session `update` trigger.
  findSessionIdentity(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, avatarUrl: true },
    });
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
