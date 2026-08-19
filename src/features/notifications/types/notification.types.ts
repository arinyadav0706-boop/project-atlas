// DTOs returned to the client — never the raw Prisma model.

/**
 * Every notification type, as a runtime list.
 *
 * A `const` array with the union derived from it, rather than a hand-written
 * union: this list is what an integration test compares against the Postgres
 * enum, and a type alone cannot be iterated at runtime. Adding a value in one
 * place and forgetting the other is precisely the failure that shipped
 * `UNBLOCKED` dead (backlog DEP-7).
 */
export const NOTIFICATION_TYPES = [
  "ASSIGNED",
  "MENTIONED",
  "STATUS_CHANGED",
  "COMMENT_ADDED",
  /** A blocker finished and this issue can start (ADR-0046 §6). */
  "UNBLOCKED",
] as const;

export type NotificationTypeDto = (typeof NOTIFICATION_TYPES)[number];

export type NotificationEntityTypeDto = "ISSUE" | "COMMENT" | "SPRINT";

export interface NotificationDto {
  id: string;
  type: NotificationTypeDto;
  entityType: NotificationEntityTypeDto;
  entityId: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  // Resolved server-side where possible (e.g. an ISSUE links to its detail
  // page). Null when the target can't be located (e.g. deleted) — the row
  // still renders, just isn't clickable.
  link: string | null;
}

export interface NotificationListDto {
  items: NotificationDto[];
  // Keyset cursor for "load more"; null on the last page.
  nextCursor: string | null;
  unreadCount: number;
}
