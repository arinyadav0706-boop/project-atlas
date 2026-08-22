import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/comments/repositories/comment.repository", () => ({
  DEFAULT_COMMENT_PAGE_SIZE: 50,
  MAX_COMMENT_PAGE_SIZE: 100,
  CommentRepository: {
    listByIssue: vi.fn(),
    countByIssue: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateWithVersion: vi.fn(),
    softDelete: vi.fn(),
    countTopLevel: vi.fn(),
    replyCounts: vi.fn(),
    previewReplies: vi.fn(),
    listReplies: vi.fn(),
    participantIds: vi.fn(),
    resolveMentionableIds: vi.fn(),
    searchMentionable: vi.fn(),
  },
}));
vi.mock("@/features/issues/repositories/issue.repository", () => ({
  IssueRepository: { findProjectId: vi.fn(), findNotificationContext: vi.fn() },
}));
vi.mock("@/features/notifications/services/notification.service", () => ({
  NotificationService: { commentPosted: vi.fn() },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { getContext: vi.fn(), getMemberRole: vi.fn() },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));

import { CommentRepository } from "@/features/comments/repositories/comment.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { NotificationService } from "@/features/notifications/services/notification.service";
import { CommentService } from "./comment.service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/shared/lib/errors";

const comments = vi.mocked(CommentRepository);
const issues = vi.mocked(IssueRepository);
const projects = vi.mocked(ProjectService);

const actor: Actor = { userId: "user-1", orgRole: "MEMBER", organizationId: "org-1" };
const ctx = {
  id: "proj-1",
  organizationId: "org-1",
  key: "ENG",
  name: "Engineering",
  status: "ACTIVE" as const,
  enforceTransitions: false,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    issueId: "issue-1",
    parentCommentId: null,
    body: "hello",
    bodyFormat: "MARKDOWN",
    authorId: "user-1",
    editedAt: null,
    version: 0,
    createdAt: new Date("2026-07-14T00:00:00Z"),
    author: { id: "user-1", name: "Founder", avatarUrl: null },
    ...overrides,
  };
}

// findById also carries the issue's projectId.
function detailRow(overrides: Record<string, unknown> = {}) {
  return { ...row(overrides), issue: { projectId: "proj-1" } };
}

beforeEach(() => {
  vi.resetAllMocks();
  projects.getContext.mockResolvedValue(ctx);
  issues.findProjectId.mockResolvedValue({ id: "issue-1", projectId: "proj-1" } as never);
  issues.findNotificationContext.mockResolvedValue({
    id: "issue-1",
    key: "P-1",
    title: "t",
    assigneeId: null,
    reporterId: "u-rep",
  } as never);
  // ADR-0038 defaults: no replies, no participants, no mentions resolve —
  // individual tests override what they are actually about.
  comments.replyCounts.mockResolvedValue(new Map() as never);
  comments.previewReplies.mockResolvedValue(new Map() as never);
  comments.countTopLevel.mockResolvedValue(0 as never);
  comments.participantIds.mockResolvedValue([] as never);
  comments.resolveMentionableIds.mockResolvedValue([] as never);
});

describe("list", () => {
  it("returns comments and canComment for a MEMBER", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    comments.listByIssue.mockResolvedValue([row({ id: "a" }), row({ id: "b" })] as never);
    const page = await CommentService.list(actor, "issue-1", {});
    expect(page.items.map((c) => c.id)).toEqual(["a", "b"]);
    expect(page.canComment).toBe(true);
    expect(page.nextCursor).toBeNull();
  });

  it("detects a further page via take+1 and returns the cursor", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    const rows = Array.from({ length: 51 }, (_, n) => row({ id: `i${n}` }));
    comments.listByIssue.mockResolvedValue(rows as never);
    const page = await CommentService.list(actor, "issue-1", {});
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBe("i49");
  });

  it("VIEWER can read but cannot comment", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER");
    comments.listByIssue.mockResolvedValue([row()] as never);
    const page = await CommentService.list(actor, "issue-1", {});
    expect(page.canComment).toBe(false);
  });

  it("treats an issue in another org as absent (F-1)", async () => {
    projects.getContext.mockResolvedValue({ ...ctx, organizationId: "org-2" });
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await expect(CommentService.list(actor, "issue-1", {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("throws NotFound when the issue does not exist", async () => {
    issues.findProjectId.mockResolvedValue(null as never);
    await expect(CommentService.list(actor, "issue-1", {})).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("create", () => {
  it("lets a MEMBER post a comment", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    comments.create.mockResolvedValue(row() as never);
    const c = await CommentService.create(actor, "issue-1", { body: "hi" });
    expect(c.body).toBe("hello");
    expect(c.canEdit).toBe(true); // author
  });

  it("forbids a VIEWER from commenting (BR-1)", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER");
    await expect(
      CommentService.create(actor, "issue-1", { body: "hi" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects commenting on an archived project", async () => {
    projects.getContext.mockResolvedValue({ ...ctx, status: "ARCHIVED", enforceTransitions: false });
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await expect(
      CommentService.create(actor, "issue-1", { body: "hi" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("update (edit)", () => {
  it("lets the author edit; stale version → 409 (ADR-0011)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    comments.findById.mockResolvedValue(detailRow({ authorId: "user-1" }) as never);
    comments.updateWithVersion.mockResolvedValue(null as never); // lost update
    await expect(
      CommentService.update(actor, "c1", { body: "edit", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("forbids editing someone else's comment (BR-3)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    comments.findById.mockResolvedValue(detailRow({ authorId: "someone-else" }) as never);
    await expect(
      CommentService.update(actor, "c1", { body: "edit", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(comments.updateWithVersion).not.toHaveBeenCalled();
  });
});

describe("delete", () => {
  it("lets the author delete their own", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    comments.findById.mockResolvedValue(detailRow({ authorId: "user-1" }) as never);
    await CommentService.delete(actor, "c1");
    expect(comments.softDelete).toHaveBeenCalledWith("c1", "user-1");
  });

  it("lets a LEAD delete another member's comment (moderation, BR-4)", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    comments.findById.mockResolvedValue(detailRow({ authorId: "other" }) as never);
    await CommentService.delete(actor, "c1");
    expect(comments.softDelete).toHaveBeenCalled();
  });

  it("forbids a MEMBER from deleting another's comment", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    comments.findById.mockResolvedValue(detailRow({ authorId: "other" }) as never);
    await expect(CommentService.delete(actor, "c1")).rejects.toBeInstanceOf(ForbiddenError);
    expect(comments.softDelete).not.toHaveBeenCalled();
  });
});

// ---- ADR-0038: mentions, participation, threads ----

const notifications = vi.mocked(NotificationService);
const mention = (name: string, id: string) => `@[${name}](user:${id})`;

describe("mentions", () => {
  beforeEach(() => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    comments.create.mockResolvedValue(row() as never);
  });

  it("notifies everyone named — there is no cap (ADR-0038 §2)", async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `u${i}`);
    comments.resolveMentionableIds.mockResolvedValue(ids as never);
    const body = ids.map((id) => mention(`P${id}`, id)).join(" ");

    await CommentService.create(actor, "issue-1", { body } as never);

    expect(notifications.commentPosted).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ mentionedIds: ids }),
    );
  });

  it("drops an id that is not a live user in the actor's org", async () => {
    // The composer only offers visible people, but a body can be hand-written.
    comments.resolveMentionableIds.mockResolvedValue([] as never);
    await CommentService.create(actor, "issue-1", {
      body: mention("Outsider", "other-org-user"),
    } as never);

    expect(comments.create).toHaveBeenCalledWith(
      expect.objectContaining({ mentionedUserIds: [] }),
    );
    expect(notifications.commentPosted).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ mentionedIds: [] }),
    );
  });

  it("notifies prior commenters, not just assignee and reporter", async () => {
    comments.participantIds.mockResolvedValue(["u-prior"] as never);
    await CommentService.create(actor, "issue-1", { body: "hi" } as never);

    expect(notifications.commentPosted).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ participantIds: [null, "u-rep", "u-prior"] }),
    );
  });

  it("on edit, notifies only the names the edit added", async () => {
    comments.findById.mockResolvedValue(
      detailRow({ body: `hi ${mention("A", "u-a")}` }) as never,
    );
    comments.resolveMentionableIds.mockResolvedValue(["u-a", "u-b"] as never);
    comments.updateWithVersion.mockResolvedValue(row() as never);

    await CommentService.update(actor, "c1", {
      body: `hi ${mention("A", "u-a")} ${mention("B", "u-b")}`,
      expectedVersion: 0,
    } as never);

    // u-a was already named — a typo fix must not re-ping the thread.
    expect(notifications.commentPosted).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ mentionedIds: ["u-b"], participantIds: [] }),
    );
  });

  it("stays silent on an edit that adds nobody", async () => {
    comments.findById.mockResolvedValue(
      detailRow({ body: `hi ${mention("A", "u-a")}` }) as never,
    );
    comments.resolveMentionableIds.mockResolvedValue(["u-a"] as never);
    comments.updateWithVersion.mockResolvedValue(row() as never);

    await CommentService.update(actor, "c1", {
      body: `hello ${mention("A", "u-a")}`,
      expectedVersion: 0,
    } as never);

    expect(notifications.commentPosted).not.toHaveBeenCalled();
  });
});

describe("threads", () => {
  beforeEach(() => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    comments.create.mockResolvedValue(row() as never);
  });

  it("keeps threads one level deep — a reply to a reply joins the same root", async () => {
    comments.findById.mockResolvedValue(
      detailRow({ id: "reply-1", parentCommentId: "root-1" }) as never,
    );

    await CommentService.create(actor, "issue-1", {
      body: "me too",
      parentCommentId: "reply-1",
    } as never);

    expect(comments.create).toHaveBeenCalledWith(
      expect.objectContaining({ parentCommentId: "root-1" }),
    );
  });

  it("keeps a reply to a root attached to that root", async () => {
    comments.findById.mockResolvedValue(
      detailRow({ id: "root-1", parentCommentId: null }) as never,
    );
    await CommentService.create(actor, "issue-1", {
      body: "reply",
      parentCommentId: "root-1",
    } as never);

    expect(comments.create).toHaveBeenCalledWith(
      expect.objectContaining({ parentCommentId: "root-1" }),
    );
  });

  it("rejects a reply whose parent belongs to another issue", async () => {
    comments.findById.mockResolvedValue(detailRow({ issueId: "other-issue" }) as never);
    await expect(
      CommentService.create(actor, "issue-1", {
        body: "x",
        parentCommentId: "c1",
      } as never),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("carries reply counts and previews onto the list", async () => {
    comments.listByIssue.mockResolvedValue([row({ id: "root-1" })] as never);
    comments.replyCounts.mockResolvedValue(new Map([["root-1", 12]]) as never);
    comments.previewReplies.mockResolvedValue(
      new Map([["root-1", [row({ id: "r1", parentCommentId: "root-1" })]]]) as never,
    );
    comments.countTopLevel.mockResolvedValue(1 as never);

    const page = await CommentService.list(actor, "issue-1", {});

    expect(page.items[0]!.replyCount).toBe(12);
    expect(page.items[0]!.replies.map((r) => r.id)).toEqual(["r1"]);
    expect(page.totalCount).toBe(1);
  });

  it("a reply has no thread page of its own", async () => {
    // Otherwise a reply would render a page claiming a structure we don't have.
    comments.findById.mockResolvedValue(detailRow({ parentCommentId: "root-1" }) as never);
    await expect(CommentService.thread(actor, "c1", {})).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns the root, its replies and the issue breadcrumb", async () => {
    comments.findById.mockResolvedValue(detailRow({ id: "root-1" }) as never);
    comments.listReplies.mockResolvedValue([row({ id: "r1" }), row({ id: "r2" })] as never);
    comments.replyCounts.mockResolvedValue(new Map([["root-1", 2]]) as never);

    const thread = await CommentService.thread(actor, "root-1", {});

    expect(thread.root.id).toBe("root-1");
    expect(thread.replies.map((r) => r.id)).toEqual(["r1", "r2"]);
    expect(thread.replyCount).toBe(2);
    expect(thread.issue).toEqual({
      id: "issue-1",
      key: "P-1",
      title: "t",
      projectId: "proj-1",
    });
  });
});
