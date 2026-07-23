import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/notifications/repositories/notification.repository", () => ({
  NotificationRepository: {
    listByUser: vi.fn(),
    unreadCount: vi.fn(),
    createMany: vi.fn(),
    enabledRecipients: vi.fn(),
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  },
}));
vi.mock("@/features/issues/repositories/issue.repository", () => ({
  IssueRepository: { findProjectIdsByIds: vi.fn() },
}));

import { NotificationRepository } from "@/features/notifications/repositories/notification.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { NotificationService } from "./notification.service";

const repo = vi.mocked(NotificationRepository);
const issues = vi.mocked(IssueRepository);
const actor: Actor = { userId: "actor-1", orgRole: "MEMBER", organizationId: "org-1" };

beforeEach(() => {
  vi.resetAllMocks();
  repo.enabledRecipients.mockImplementation(async (ids: string[]) => ids);
  repo.createMany.mockResolvedValue({ count: 0 } as never);
});

describe("fan-out", () => {
  it("dedupes recipients, drops the actor and empties, filters enabled", async () => {
    repo.enabledRecipients.mockResolvedValue(["u2"]); // pretend u3 disabled
    await NotificationService.issueCommented(actor, {
      issueId: "i-1",
      issueKey: "ENG-1",
      recipientIds: ["actor-1", "u2", "u2", null, undefined, "u3"],
    });
    // actor + null/undefined removed, u2 deduped → candidates [u2, u3]
    expect(repo.enabledRecipients).toHaveBeenCalledWith(["u2", "u3"]);
    expect(repo.createMany).toHaveBeenCalledTimes(1);
    const rows = repo.createMany.mock.calls[0]![0];
    expect(rows).toEqual([
      expect.objectContaining({ userId: "u2", type: "COMMENT_ADDED", entityId: "i-1" }),
    ]);
  });

  it("issueAssigned is a no-op when there's no assignee", async () => {
    await NotificationService.issueAssigned(actor, {
      issueId: "i-1",
      issueKey: "ENG-1",
      issueTitle: "x",
      assigneeId: null,
    });
    expect(repo.enabledRecipients).not.toHaveBeenCalled();
    expect(repo.createMany).not.toHaveBeenCalled();
  });

  it("does not create when all recipients are filtered out", async () => {
    repo.enabledRecipients.mockResolvedValue([]);
    await NotificationService.issueStatusChanged(actor, {
      issueId: "i-1",
      issueKey: "ENG-1",
      status: "DONE",
      recipientIds: ["u9"],
    });
    expect(repo.createMany).not.toHaveBeenCalled();
  });
});

describe("list", () => {
  it("paginates, resolves issue links, and returns the unread count", async () => {
    const base = { type: "ASSIGNED", entityType: "ISSUE", message: "m", isRead: false };
    // take defaults to 20; return 21 rows so hasMore is true.
    const rows = Array.from({ length: 21 }, (_, n) => ({
      ...base,
      id: `n-${n}`,
      entityId: "i-1",
      createdAt: new Date(2026, 0, 1, 0, 0, 21 - n),
    }));
    repo.listByUser.mockResolvedValue(rows as never);
    repo.unreadCount.mockResolvedValue(5);
    issues.findProjectIdsByIds.mockResolvedValue([{ id: "i-1", projectId: "p-1" }] as never);

    const out = await NotificationService.list(actor, {});
    expect(out.items).toHaveLength(20);
    expect(out.nextCursor).not.toBeNull();
    expect(out.unreadCount).toBe(5);
    expect(out.items[0]!.link).toBe("/projects/p-1/issues/i-1");
  });
});
