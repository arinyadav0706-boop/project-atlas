import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/issues/repositories/issue.repository", () => ({
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
  IssueRepository: {
    listByProject: vi.fn(),
    countByStatus: vi.fn(),
    findDetail: vi.fn(),
    findEpic: vi.fn(),
    createWithKey: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
    findRankInColumn: vi.fn(),
    setRankAndStatus: vi.fn(),
    softDelete: vi.fn(),
  },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: {
    getContext: vi.fn(),
    getMemberRole: vi.fn(),
  },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));

import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { IssueService } from "./issue.service";
import { ConflictError, ForbiddenError, ValidationError } from "@/shared/lib/errors";

const repo = vi.mocked(IssueRepository);
const projects = vi.mocked(ProjectService);
const audit = vi.mocked(AuditLogService);

const actor: Actor = { userId: "user-1", orgRole: "MEMBER", organizationId: "org-1" };

const ctx = {
  id: "proj-1",
  organizationId: "org-1",
  key: "ENG",
  name: "Engineering",
  status: "ACTIVE" as const,
};

function issueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "issue-1",
    projectId: "proj-1",
    key: "ENG-1",
    type: "TASK",
    title: "Do the thing",
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    assigneeId: null,
    reporterId: "user-1",
    sprintId: null,
    epicId: null,
    storyPoints: null,
    rank: "a0",
    dueDate: null,
    createdAt: new Date("2026-07-14T00:00:00Z"),
    updatedAt: new Date("2026-07-14T00:00:00Z"),
    createdBy: "user-1",
    updatedBy: null,
    deletedAt: null,
    assignee: null,
    reporter: { id: "user-1", name: "Founder", avatarUrl: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  projects.getContext.mockResolvedValue(ctx);
});

describe("list (pagination + counts)", () => {
  beforeEach(() => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.countByStatus.mockResolvedValue([
      { status: "TODO", _count: { _all: 2 } },
      { status: "DONE", _count: { _all: 1 } },
    ] as never);
  });

  it("returns a nextCursor when the repo yields more than a page", async () => {
    // Service asks for take+1 rows to detect a further page; simulate a full
    // page of 2 plus one extra.
    repo.listByProject.mockResolvedValue([
      issueRow({ id: "a" }),
      issueRow({ id: "b" }),
      issueRow({ id: "c" }),
    ] as never);

    const page = await IssueService.list(actor, "proj-1", { take: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(page.nextCursor).toBe("b");
  });

  it("returns nextCursor null on the last page", async () => {
    repo.listByProject.mockResolvedValue([issueRow({ id: "a" })] as never);

    const page = await IssueService.list(actor, "proj-1", { take: 2 });

    expect(page.items).toHaveLength(1);
    expect(page.nextCursor).toBeNull();
  });

  it("maps grouped counts into per-status totals with ALL as the sum", async () => {
    repo.listByProject.mockResolvedValue([] as never);

    const page = await IssueService.list(actor, "proj-1");

    expect(page.counts).toMatchObject({
      ALL: 3,
      TODO: 2,
      IN_PROGRESS: 0,
      IN_REVIEW: 0,
      DONE: 1,
    });
  });
});

describe("create", () => {
  it("generates a key and sets the reporter (BR-1)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.createWithKey.mockResolvedValue(issueRow({ key: "ENG-7" }) as never);

    const dto = await IssueService.create(actor, "proj-1", {
      type: "TASK",
      title: "Do the thing",
      priority: "MEDIUM",
    });

    expect(repo.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({ reporterId: "user-1", projectId: "proj-1" }),
    );
    expect(dto.key).toBe("ENG-7");
  });

  it("forbids a VIEWER from creating (BR-2)", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER");
    await expect(
      IssueService.create(actor, "proj-1", { type: "TASK", title: "x", priority: "MEDIUM" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("forbids a non-member (org admin with no project role) from creating", async () => {
    projects.getMemberRole.mockResolvedValue(null);
    await expect(
      IssueService.create(
        { userId: "admin-1", orgRole: "ADMIN", organizationId: "org-1" },
        "proj-1",
        { type: "TASK", title: "x", priority: "MEDIUM" },
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects an assignee who is not a project member (BR-3)", async () => {
    projects.getMemberRole.mockImplementation(async (_p, userId) =>
      userId === "user-1" ? "MEMBER" : null,
    );
    await expect(
      IssueService.create(actor, "proj-1", {
        type: "TASK",
        title: "x",
        priority: "MEDIUM",
        assigneeId: "outsider",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an epic parent that is not an Epic in the project (BR-4)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.findEpic.mockResolvedValue(null);
    await expect(
      IssueService.create(actor, "proj-1", {
        type: "TASK",
        title: "x",
        priority: "MEDIUM",
        epicId: "not-an-epic",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects creation on an archived project (BR-4 projects)", async () => {
    projects.getContext.mockResolvedValue({ ...ctx, status: "ARCHIVED" });
    projects.getMemberRole.mockResolvedValue("LEAD");
    await expect(
      IssueService.create(actor, "proj-1", { type: "TASK", title: "x", priority: "MEDIUM" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("transition", () => {
  it("rejects an illegal transition with a validation error (BR-5)", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO" }) as never);
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await expect(
      IssueService.transition(actor, "issue-1", "DONE"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("performs a legal transition and audit-logs it (BR-6)", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO" }) as never);
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.setStatus.mockResolvedValue(issueRow({ status: "IN_PROGRESS" }) as never);

    await IssueService.transition(actor, "issue-1", "IN_PROGRESS");

    expect(repo.setStatus).toHaveBeenCalledWith("issue-1", "IN_PROGRESS", "user-1");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ISSUE_STATUS_CHANGED",
        beforeData: { status: "TODO" },
        afterData: { status: "IN_PROGRESS" },
      }),
    );
  });
});

describe("reorder (Board/Backlog, ADR-0009)", () => {
  beforeEach(() => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
  });

  it("computes a rank between the destination neighbours and writes one row", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO", rank: "a5" }) as never);
    // beforeId sits in the same column at "a1", afterId at "a3".
    repo.findRankInColumn.mockImplementation(((id: string) =>
      Promise.resolve(
        id === "before-1"
          ? { id: "before-1", rank: "a1" }
          : id === "after-1"
            ? { id: "after-1", rank: "a3" }
            : null,
      )) as never);
    repo.setRankAndStatus.mockResolvedValue(issueRow({ rank: "a2" }) as never);

    await IssueService.reorder(actor, "issue-1", {
      beforeId: "before-1",
      afterId: "after-1",
    });

    const [, data] = repo.setRankAndStatus.mock.calls[0]!;
    expect(data.rank > "a1" && data.rank < "a3").toBe(true);
    expect(data.status).toBeUndefined(); // same-column reorder: no status write
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("applies the workflow check and audits when the column changes (BR-3)", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO", rank: "a0" }) as never);
    repo.findRankInColumn.mockResolvedValue(null); // dropped at an empty column end
    repo.setRankAndStatus.mockResolvedValue(
      issueRow({ status: "IN_PROGRESS" }) as never,
    );

    await IssueService.reorder(actor, "issue-1", { status: "IN_PROGRESS" });

    const [, data] = repo.setRankAndStatus.mock.calls[0]!;
    expect(data.status).toBe("IN_PROGRESS");
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ISSUE_STATUS_CHANGED",
        afterData: { status: "IN_PROGRESS" },
      }),
    );
  });

  it("rejects an illegal column move (TODO → DONE) before any write", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO" }) as never);
    await expect(
      IssueService.reorder(actor, "issue-1", { status: "DONE" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.setRankAndStatus).not.toHaveBeenCalled();
  });

  it("forbids a VIEWER from reordering (BR-5)", async () => {
    repo.findDetail.mockResolvedValue(issueRow() as never);
    projects.getMemberRole.mockResolvedValue("VIEWER");
    await expect(
      IssueService.reorder(actor, "issue-1", { beforeId: null, afterId: null }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a neighbour that is not in the destination column (stale client)", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO" }) as never);
    repo.findRankInColumn.mockResolvedValue(null); // beforeId not found in column
    await expect(
      IssueService.reorder(actor, "issue-1", { beforeId: "ghost" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.setRankAndStatus).not.toHaveBeenCalled();
  });

  it("rejects positioning a card relative to itself", async () => {
    repo.findDetail.mockResolvedValue(issueRow() as never);
    await expect(
      IssueService.reorder(actor, "issue-1", { beforeId: "issue-1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a reorder on an archived project", async () => {
    projects.getContext.mockResolvedValue({ ...ctx, status: "ARCHIVED" });
    repo.findDetail.mockResolvedValue(issueRow() as never);
    await expect(
      IssueService.reorder(actor, "issue-1", { beforeId: null, afterId: null }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("delete", () => {
  it("lets the reporter delete", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ reporterId: "user-1" }) as never);
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.softDelete.mockResolvedValue(issueRow() as never);
    await IssueService.delete(actor, "issue-1");
    expect(repo.softDelete).toHaveBeenCalledWith("issue-1", "user-1");
  });

  it("forbids a member who is neither lead nor reporter/assignee", async () => {
    repo.findDetail.mockResolvedValue(
      issueRow({ reporterId: "someone", assigneeId: "another" }) as never,
    );
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await expect(IssueService.delete(actor, "issue-1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
