import { prisma } from "@/shared/lib/db";
import type { InteractionType, RecentEntityType } from "@prisma/client";

// Per-user engagement signal (ADR-0012). One row per (user, entity), upserted on
// interaction — the source of "Continue working" and "recent projects".

export const RecentItemRepository = {
  record(input: {
    userId: string;
    entityType: RecentEntityType;
    entityId: string;
    interactionType: InteractionType;
  }) {
    const { userId, entityType, entityId, interactionType } = input;
    return prisma.recentItem.upsert({
      where: { userId_entityType_entityId: { userId, entityType, entityId } },
      create: { userId, entityType, entityId, interactionType },
      update: { interactionType, lastInteractedAt: new Date() },
    });
  },

  // Most-recently-engaged entities of a type (over-fetch, then rank/scope in
  // the service). Uses the (userId, lastInteractedAt desc) index.
  listByType(userId: string, entityType: RecentEntityType, take: number) {
    return prisma.recentItem.findMany({
      where: { userId, entityType },
      orderBy: { lastInteractedAt: "desc" },
      take,
    });
  },

  // Last-interaction timestamps for specific entities — powers "changed since I
  // last looked" in the attention source.
  forEntities(userId: string, entityType: RecentEntityType, entityIds: string[]) {
    return prisma.recentItem.findMany({
      where: { userId, entityType, entityId: { in: entityIds } },
      select: { entityId: true, lastInteractedAt: true },
    });
  },
};
