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
  },
}));
vi.mock("@/features/issues/repositories/issue.repository", () => ({
  IssueRepository: { findProjectId: vi.fn() },
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
    projects.getContext.mockResolvedValue({ ...ctx, status: "ARCHIVED" });
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
