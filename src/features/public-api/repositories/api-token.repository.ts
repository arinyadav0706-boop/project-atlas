import { prisma } from "@/shared/lib/db";

// API tokens (ADR-0052 §2). Prisma lives only in `*.repository.ts`
// (Feature Architecture §4).

const tokenSelect = {
  id: true,
  organizationId: true,
  userId: true,
  name: true,
  publicId: true,
  scopes: true,
  lastUsedAt: true,
  expiresAt: true,
  revokedAt: true,
  createdAt: true,
  user: { select: { id: true, name: true } },
} as const;

export const ApiTokenRepository = {
  /**
   * The one read on the authentication path.
   *
   * By `publicId`, which is unique and indexed — this runs on every single API
   * request, so it has to be a point read. `secretHash` is pulled here and
   * nowhere else; the list query deliberately cannot see it.
   *
   * The owner's org and active flag come along because a token must stop
   * working the moment its owner is deactivated, and checking that in a second
   * query would double the cost of every request.
   */
  findForAuth(publicId: string) {
    return prisma.apiToken.findFirst({
      where: { publicId, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        userId: true,
        secretHash: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
        user: { select: { id: true, isActive: true, orgRole: true, deletedAt: true } },
      },
    });
  },

  /**
   * Record use, fire-and-forget.
   *
   * Throttled to once a minute per token by the caller: writing on every
   * request would put an UPDATE in front of every read in the API, which is a
   * high price for a timestamp nobody reads to the second (BR-14).
   */
  touch(id: string) {
    return prisma.apiToken.updateMany({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  },

  listForUser(userId: string) {
    return prisma.apiToken.findMany({
      where: { userId, deletedAt: null },
      select: tokenSelect,
      orderBy: [{ createdAt: "desc" }],
    });
  },

  findById(id: string) {
    return prisma.apiToken.findFirst({
      where: { id, deletedAt: null },
      select: tokenSelect,
    });
  },

  countLiveForUser(userId: string) {
    return prisma.apiToken.count({
      where: { userId, deletedAt: null, revokedAt: null },
    });
  },

  create(data: {
    organizationId: string;
    userId: string;
    name: string;
    publicId: string;
    secretHash: string;
    scopes: string[];
    expiresAt: Date | null;
  }) {
    return prisma.apiToken.create({
      data: { ...data, createdBy: data.userId, updatedBy: data.userId },
      select: tokenSelect,
    });
  },

  /**
   * Revoke rather than delete.
   *
   * The row is what answers "was this token used, and when" after an incident.
   * Deleting it destroys exactly the evidence somebody needs.
   */
  revoke(id: string, actorId: string) {
    return prisma.apiToken.update({
      where: { id },
      data: { revokedAt: new Date(), updatedBy: actorId },
      select: { id: true },
    });
  },
};
