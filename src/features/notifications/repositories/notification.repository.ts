import { prisma } from "@/shared/lib/db";
import type { NotificationType, NotificationEntityType } from "@prisma/client";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §4).
// Notifications are per-recipient rows (ADR-0019); reads are always scoped to
// the current user by the service.

const NOTIFICATION_PAGE_SIZE = 20;

const notificationSelect = {
  id: true,
  type: true,
  entityType: true,
  entityId: true,
  message: true,
  isRead: true,
  createdAt: true,
} as const;

type Cursor = { createdAt: Date; id: string };

export const NotificationRepository = {
  // Newest-first, keyset-paginated. A composite (createdAt, id) cursor gives a
  // stable total order even when many rows share a timestamp.
  listByUser(userId: string, cursor: Cursor | null, take = NOTIFICATION_PAGE_SIZE) {
    return prisma.notification.findMany({
      where: {
        userId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      select: notificationSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1, // one extra row signals "there's a next page"
    });
  },

  unreadCount(userId: string) {
    return prisma.notification.count({ where: { userId, isRead: false } });
  },

  createMany(
    rows: {
      userId: string;
      type: NotificationType;
      entityType: NotificationEntityType;
      entityId: string;
      message: string;
      createdBy: string;
    }[],
  ) {
    return prisma.notification.createMany({ data: rows });
  },

  // Of the given user ids, those who accept notifications (BR-2) and are active.
  async enabledRecipients(userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, notificationsEnabled: true, deletedAt: null },
      select: { id: true },
    });
    return users.map((u) => u.id);
  },

  // Mark one notification read — scoped to the owner (returns rows affected).
  async markRead(id: string, userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { id, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  },

  markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  },
};

export { NOTIFICATION_PAGE_SIZE };
