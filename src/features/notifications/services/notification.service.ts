import { NotificationRepository } from "@/features/notifications/repositories/notification.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import type { Actor } from "@/shared/types/actor";
import type {
  NotificationDto,
  NotificationListDto,
  NotificationTypeDto,
  NotificationEntityTypeDto,
} from "@/features/notifications/types/notification.types";

// Notification generation + reads (ADR-0019). Trigger services call the typed
// helpers below right after their own successful write; this service owns all
// fan-out. Failures here must NEVER fail the user's action, so `notify` is
// best-effort (swallows its own errors).

const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};

function truncate(text: string, max = 60): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return `${row.createdAt.toISOString()}__${row.id}`;
}

function decodeCursor(raw: string | undefined): { createdAt: Date; id: string } | null {
  if (!raw) return null;
  const [iso, id] = raw.split("__");
  if (!iso || !id) return null;
  const createdAt = new Date(iso);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, id };
}

// Core fan-out: dedupe recipients, drop the actor (never notify yourself),
// keep only those who accept notifications (BR-2), then one bounded createMany.
async function notify(
  actor: Actor,
  input: {
    recipientIds: (string | null | undefined)[];
    type: NotificationTypeDto;
    entityType: NotificationEntityTypeDto;
    entityId: string;
    message: string;
  },
): Promise<void> {
  try {
    const candidates = [...new Set(input.recipientIds)].filter(
      (id): id is string => Boolean(id) && id !== actor.userId,
    );
    // Bail before touching the database. `commentPosted` calls this twice — once
    // per type — and on most comments one of those two lists is empty.
    if (candidates.length === 0) return;
    const recipients = await NotificationRepository.enabledRecipients(candidates);
    if (recipients.length === 0) return;
    await NotificationRepository.createMany(
      recipients.map((userId) => ({
        userId,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        message: input.message,
        createdBy: actor.userId,
      })),
    );
  } catch (error) {
    // Best-effort (ADR-0019): a notification failure must not break the action.
    console.error("Notification fan-out failed", error);
  }
}

export const NotificationService = {
  // --- Trigger helpers (called by issue/comment/component services) ---

  issueAssigned(
    actor: Actor,
    input: { issueId: string; issueKey: string; issueTitle: string; assigneeId: string | null },
  ) {
    if (!input.assigneeId) return Promise.resolve();
    return notify(actor, {
      recipientIds: [input.assigneeId],
      type: "ASSIGNED",
      entityType: "ISSUE",
      entityId: input.issueId,
      message: `You were assigned ${input.issueKey}: ${truncate(input.issueTitle)}`,
    });
  },

  /**
   * A comment was posted (or edited to name someone new) — ADR-0038 §3.
   *
   * Two audiences, and the precedence between them is the point: someone who is
   * both mentioned and a participant gets **one** notification, typed
   * `MENTIONED`. A mention is strictly more urgent than "there was activity",
   * and two rows for one comment is the behaviour that makes people switch
   * notifications off.
   *
   * No cap on `mentionedIds` (ADR-0038 §2) — the fan-out is one batched insert
   * per type, and mutations are rate limited upstream.
   */
  async commentPosted(
    actor: Actor,
    input: {
      issueId: string;
      issueKey: string;
      commentId: string;
      preview: string;
      mentionedIds: string[];
      participantIds: (string | null | undefined)[];
    },
  ): Promise<void> {
    const mentioned = new Set(input.mentionedIds);

    await notify(actor, {
      recipientIds: input.mentionedIds,
      type: "MENTIONED",
      entityType: "ISSUE",
      entityId: input.issueId,
      message: `You were mentioned on ${input.issueKey}: ${input.preview}`,
    });

    // Everyone else with a stake in the thread. Filtered before `notify` so the
    // mentioned are excluded by identity, not by luck of ordering.
    const others = input.participantIds.filter(
      (id): id is string => typeof id === "string" && id.length > 0 && !mentioned.has(id),
    );
    await notify(actor, {
      recipientIds: others,
      type: "COMMENT_ADDED",
      entityType: "ISSUE",
      entityId: input.issueId,
      message: `New comment on ${input.issueKey}: ${input.preview}`,
    });
  },

  issueStatusChanged(
    actor: Actor,
    input: {
      issueId: string;
      issueKey: string;
      status: string;
      recipientIds: (string | null | undefined)[];
    },
  ) {
    return notify(actor, {
      recipientIds: input.recipientIds,
      type: "STATUS_CHANGED",
      entityType: "ISSUE",
      entityId: input.issueId,
      message: `${input.issueKey} moved to ${STATUS_LABELS[input.status] ?? input.status}`,
    });
  },

  // --- Reads (the bell + notifications page) ---

  async list(
    actor: Actor,
    options: { cursor?: string; take?: number } = {},
  ): Promise<NotificationListDto> {
    const cursor = decodeCursor(options.cursor);
    const take = options.take ?? 20;
    const rows = await NotificationRepository.listByUser(actor.userId, cursor, take);

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]!) : null;

    // Resolve ISSUE links in one batch query rather than per-row.
    const issueIds = page
      .filter((r) => r.entityType === "ISSUE")
      .map((r) => r.entityId);
    const projectByIssue = new Map<string, string>();
    if (issueIds.length > 0) {
      const found = await IssueRepository.findProjectIdsByIds(issueIds);
      for (const row of found) projectByIssue.set(row.id, row.projectId);
    }

    const [unreadCount, items] = [
      await NotificationRepository.unreadCount(actor.userId),
      page.map((r): NotificationDto => {
        const projectId =
          r.entityType === "ISSUE" ? projectByIssue.get(r.entityId) : undefined;
        return {
          id: r.id,
          type: r.type,
          entityType: r.entityType,
          entityId: r.entityId,
          message: r.message,
          isRead: r.isRead,
          createdAt: r.createdAt.toISOString(),
          link: projectId ? `/projects/${projectId}/issues/${r.entityId}` : null,
        };
      }),
    ];

    return { items, nextCursor, unreadCount };
  },

  unreadCount(actor: Actor): Promise<number> {
    return NotificationRepository.unreadCount(actor.userId);
  },

  // Idempotent; scoped to the owner (a non-owned/again id is a silent no-op).
  async markRead(actor: Actor, notificationId: string): Promise<void> {
    await NotificationRepository.markRead(notificationId, actor.userId);
  },

  async markAllRead(actor: Actor): Promise<void> {
    await NotificationRepository.markAllRead(actor.userId);
  },
};
