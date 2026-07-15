import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/issues/repositories/issue.repository", () => ({
  IssueRepository: {
    listByProject: vi.fn(),
    findDetail: vi.fn(),
    findEpic: vi.fn(),
    createWithKey: vi.fn(),
    update: vi.fn(),
    setStatus: vi.fn(),
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

const actor: Actor = { userId: "user-1", orgRole: "MEMBER" };

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
    boardOrder: 1,
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
        { userId: "admin-1", orgRole: "ADMIN" },
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
