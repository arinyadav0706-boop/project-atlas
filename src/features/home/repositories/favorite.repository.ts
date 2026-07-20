import { prisma } from "@/shared/lib/db";
import type { FavoriteEntityType } from "@prisma/client";

// Explicit per-user pins (ADR-0012). Unstar hard-deletes the row (a preference,
// not domain data — documented exception to the no-hard-delete rule).

export const FavoriteRepository = {
  add(userId: string, entityType: FavoriteEntityType, entityId: string) {
    return prisma.favorite.upsert({
      where: { userId_entityType_entityId: { userId, entityType, entityId } },
      create: { userId, entityType, entityId },
      update: {},
    });
  },

  remove(userId: string, entityType: FavoriteEntityType, entityId: string) {
    return prisma.favorite.deleteMany({ where: { userId, entityType, entityId } });
  },

  listEntityIds(userId: string, entityType: FavoriteEntityType) {
    return prisma.favorite.findMany({
      where: { userId, entityType },
      select: { entityId: true },
    });
  },
};
