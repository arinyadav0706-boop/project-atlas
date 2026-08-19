import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/issues/repositories/issue.repository", () => ({
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
  IssueRepository: {
    findDetail: vi.fn(),
    findEpic: vi.fn(),
    listChildren: vi.fn(),
    detachChildren: vi.fn(),
    findSubtaskParentCandidate: vi.fn(),
    countSubtasks: vi.fn(),
    listSubtasks: vi.fn(),
    countOpenSubtasks: vi.fn(),
    softDeleteSubtasks: vi.fn(),
    setSubtasksSprint: vi.fn(),
    createWithKey: vi.fn(),
    updateWithVersion: vi.fn(),
    setStatusWithVersion: vi.fn(),
    findRankInColumn: vi.fn(),
    findRankInBacklog: vi.fn(),
    reorderWithVersion: vi.fn(),
    softDelete: vi.fn(),
  },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { getContext: vi.fn(), getMemberRole: vi.fn() },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));
vi.mock("@/features/home/services/recent-item.service", () => ({
  RecentItemService: { record: vi.fn() },
}));
vi.mock("@/features/custom-fields/services/custom-field.service", () => ({
  CustomFieldService: { missingRequired: async () => [], setForIssue: async () => [] },
}));
// Dependencies (ADR-0046) are read on every issue detail. Plain async stubs:
// these suites are about issues, not links, and `resetAllMocks` would strip a
// `vi.fn()` implementation and leave `list` returning undefined mid-render.
vi.mock("@/features/dependencies/services/dependency.service", () => ({
  DependencyService: {
    list: async () => ({ links: [], openBlockerKeys: [] }),
    notifyUnblocked: async () => undefined,
  },
}));
vi.mock("@/features/notifications/services/notification.service", () => ({
  NotificationService: { issueAssigned: vi.fn(), issueStatusChanged: vi.fn() },
}));

import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { IssueService } from "./issue.service";
import { ConflictError, ValidationError } from "@/shared/lib/errors";
import { MAX_SUBTASKS_PER_PARENT } from "@/features/issues/validation/issue.schemas";

// Subtasks (docs/02_Modules/26_subtasks.md, ADR-0045).

const repo = vi.mocked(IssueRepository);
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
    id: "issue-1",
    projectId: "proj-1",
    key: "ENG-1",
    type: "TASK",
    title: "Add login",
    description: null,
    status: "TODO",
    priority: "MEDIUM",
    assigneeId: null,
    reporterId: "user-1",
    sprintId: null,
    epicId: null,
    parentId: null,
    storyPoints: null,
    estimateMinutes: null,
    rank: "a0",
    version: 0,
    dueDate: null,
    createdAt: new Date("2026-08-19T00:00:00Z"),
    updatedAt: new Date("2026-08-19T00:00:00Z"),
    createdBy: "user-1",
    updatedBy: null,
    deletedAt: null,
    assignee: null,
    reporter: { id: "user-1", name: "Founder", avatarUrl: null },
    epic: null,
    parent: null,
    ...overrides,
  };
}

function subtask(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub-1",
    key: "ENG-2",
    title: "Write the tests",
    status: "TODO",
    priority: "MEDIUM",
    estimateMinutes: null,
    version: 0,
    assignee: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  projects.getContext.mockResolvedValue(ctx as never);
  projects.getMemberRole.mockResolvedValue("MEMBER" as never);
  repo.findDetail.mockResolvedValue(row() as never);
  repo.listSubtasks.mockResolvedValue([] as never);
  repo.listChildren.mockResolvedValue([] as never);
  repo.countSubtasks.mockResolvedValue(0 as never);
  repo.countOpenSubtasks.mockResolvedValue(0 as never);
  repo.softDeleteSubtasks.mockResolvedValue({ count: 0 } as never);
  repo.createWithKey.mockResolvedValue(row({ id: "sub-1", type: "SUBTASK" }) as never);
});

// BR-2 / ADR-0045 §3 — one level, and it cannot be extended by accident.
describe("what may parent a subtask", () => {
  it("creates one under a Story, Task or Bug", async () => {
    repo.findSubtaskParentCandidate.mockResolvedValue({
      id: "issue-1",
      projectId: "proj-1",
      sprintId: null,
      status: "TODO",
    } as never);

    await IssueService.createSubtask(actor, "issue-1", { title: "Write the tests", priority: "MEDIUM" });

    expect(repo.createWithKey.mock.calls[0]![0]).toMatchObject({
      type: "SUBTASK",
      parentId: "issue-1",
    });
  });

  it("refuses an Epic as a parent", async () => {
    // The repository's own WHERE excludes EPIC, so it simply finds nothing.
    repo.findSubtaskParentCandidate.mockResolvedValue(null as never);
    await expect(
      IssueService.createSubtask(actor, "issue-1", { title: "x", priority: "MEDIUM" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createWithKey).not.toHaveBeenCalled();
  });

  it("refuses a subtask as a parent — no nesting", async () => {
    repo.findSubtaskParentCandidate.mockResolvedValue(null as never);
    await expect(
      IssueService.createSubtask(actor, "sub-1", { title: "x", priority: "MEDIUM" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses the 51st subtask under one parent (BR-9)", async () => {
    repo.findSubtaskParentCandidate.mockResolvedValue({
      id: "issue-1",
      projectId: "proj-1",
      sprintId: null,
      status: "TODO",
    } as never);
    repo.countSubtasks.mockResolvedValue(MAX_SUBTASKS_PER_PARENT as never);

    await expect(
      IssueService.createSubtask(actor, "issue-1", { title: "x", priority: "MEDIUM" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.createWithKey).not.toHaveBeenCalled();
  });
});

// BR-4 — a subtask has no sprint of its own.
describe("a subtask follows its parent's sprint", () => {
  it("inherits the parent's sprint on create", async () => {
    repo.findSubtaskParentCandidate.mockResolvedValue({
      id: "issue-1",
      projectId: "proj-1",
      sprintId: "sprint-7",
      status: "TODO",
    } as never);

    await IssueService.createSubtask(actor, "issue-1", { title: "x", priority: "MEDIUM" });

    expect(repo.createWithKey.mock.calls[0]![0]).toMatchObject({ sprintId: "sprint-7" });
  });
});

// BR-6 — the divergence from Jira, and the reason for it.
describe("story points", () => {
  it("refuses points on a subtask rather than accepting and ignoring them", async () => {
    repo.findDetail.mockResolvedValue(row({ type: "SUBTASK", parentId: "issue-9" }) as never);

    await expect(
      IssueService.update(actor, "sub-1", { storyPoints: 3, expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.updateWithVersion).not.toHaveBeenCalled();
  });

  it("clears the points an issue had when it becomes a subtask", async () => {
    repo.findDetail.mockResolvedValue(row({ storyPoints: 5, epicId: "epic-1" }) as never);
    repo.findSubtaskParentCandidate.mockResolvedValue({
      id: "parent-1",
      projectId: "proj-1",
      sprintId: null,
      status: "TODO",
    } as never);
    repo.updateWithVersion.mockResolvedValue(
      row({ type: "SUBTASK", parentId: "parent-1", storyPoints: null }) as never,
    );

    await IssueService.update(actor, "issue-1", {
      parentId: "parent-1",
      expectedVersion: 0,
    });

    // Both cleared: points because a subtask cannot carry them (BR-6), the epic
    // because a subtask reaches its epic through its parent (BR-3).
    expect(repo.updateWithVersion.mock.calls[0]![2]).toMatchObject({
      type: "SUBTASK",
      parentId: "parent-1",
      storyPoints: null,
      epicId: null,
    });
  });
});

// BR-7 — the guard that protects cycle time and velocity.
describe("a parent cannot be marked done over open subtasks", () => {
  beforeEach(() => {
    repo.findDetail.mockResolvedValue(row({ status: "IN_REVIEW" }) as never);
  });

  it("refuses the transition and names the count", async () => {
    repo.countOpenSubtasks.mockResolvedValue(3 as never);
    await expect(
      IssueService.transition(actor, "issue-1", "DONE", 0),
    ).rejects.toThrow(/3 subtasks are still open/);
    expect(repo.setStatusWithVersion).not.toHaveBeenCalled();
  });

  it("allows it once they are all done", async () => {
    repo.countOpenSubtasks.mockResolvedValue(0 as never);
    repo.setStatusWithVersion.mockResolvedValue(row({ status: "DONE" }) as never);
    await expect(IssueService.transition(actor, "issue-1", "DONE", 0)).resolves.toBeTruthy();
  });

  it("does not block any other transition", async () => {
    repo.countOpenSubtasks.mockResolvedValue(3 as never);
    repo.findDetail.mockResolvedValue(row({ status: "IN_PROGRESS" }) as never);
    repo.setStatusWithVersion.mockResolvedValue(row({ status: "IN_REVIEW" }) as never);
    await expect(
      IssueService.transition(actor, "issue-1", "IN_REVIEW", 0),
    ).resolves.toBeTruthy();
  });

  it("guards the board drag too, not just the status menu", async () => {
    repo.countOpenSubtasks.mockResolvedValue(1 as never);
    await expect(
      IssueService.reorder(actor, "issue-1", {
        scope: "board",
        status: "DONE",
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.reorderWithVersion).not.toHaveBeenCalled();
  });

  it("never fires for a subtask itself — it has no subtasks to wait on", async () => {
    repo.findDetail.mockResolvedValue(
      row({ type: "SUBTASK", parentId: "p1", status: "IN_REVIEW" }) as never,
    );
    repo.setStatusWithVersion.mockResolvedValue(row({ status: "DONE" }) as never);
    await IssueService.transition(actor, "sub-1", "DONE", 0);
    expect(repo.countOpenSubtasks).not.toHaveBeenCalled();
  });
});

// BR-8 — two relationships, two delete rules.
describe("deleting", () => {
  it("cascades to a parent's subtasks", async () => {
    repo.softDelete.mockResolvedValue(row() as never);
    await IssueService.delete(actor, "issue-1");
    expect(repo.softDeleteSubtasks).toHaveBeenCalledWith("issue-1", "user-1");
  });

  it("still only DETACHES an epic's children, never cascades them", async () => {
    repo.findDetail.mockResolvedValue(row({ type: "EPIC" }) as never);
    repo.detachChildren.mockResolvedValue({ count: 2 } as never);
    repo.softDelete.mockResolvedValue(row() as never);

    await IssueService.delete(actor, "issue-1");

    expect(repo.detachChildren).toHaveBeenCalledWith("issue-1", "user-1");
    // An Epic cannot parent a subtask, so the cascade must not run for one.
    expect(repo.softDeleteSubtasks).not.toHaveBeenCalled();
  });
});

// BR-10 — conversions, in both directions.
describe("converting", () => {
  it("promotes a subtask back to a standalone Task", async () => {
    repo.findDetail.mockResolvedValue(row({ type: "SUBTASK", parentId: "p1" }) as never);
    repo.updateWithVersion.mockResolvedValue(row() as never);

    await IssueService.update(actor, "sub-1", { parentId: null, expectedVersion: 0 });

    expect(repo.updateWithVersion.mock.calls[0]![2]).toMatchObject({
      type: "TASK",
      parentId: null,
    });
  });

  it("refuses to make an Epic into a subtask", async () => {
    repo.findDetail.mockResolvedValue(row({ type: "EPIC" }) as never);
    await expect(
      IssueService.update(actor, "issue-1", { parentId: "p1", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to nest an issue that already has subtasks of its own", async () => {
    repo.findSubtaskParentCandidate.mockResolvedValue({
      id: "parent-1",
      projectId: "proj-1",
      sprintId: null,
      status: "TODO",
    } as never);
    // The issue being converted has one — that would create depth 2.
    repo.countSubtasks.mockResolvedValue(1 as never);

    await expect(
      IssueService.update(actor, "issue-1", { parentId: "parent-1", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("adopts the parent's sprint when converting in (BR-4)", async () => {
    repo.findSubtaskParentCandidate.mockResolvedValue({
      id: "parent-1",
      projectId: "proj-1",
      sprintId: "sprint-3",
      status: "TODO",
    } as never);
    repo.updateWithVersion.mockResolvedValue(row({ type: "SUBTASK" }) as never);

    await IssueService.update(actor, "issue-1", {
      parentId: "parent-1",
      expectedVersion: 0,
    });

    expect(repo.updateWithVersion.mock.calls[0]![2]).toMatchObject({ sprintId: "sprint-3" });
  });

  it("asks for a parent rather than writing a SUBTASK with none", async () => {
    await expect(
      IssueService.update(actor, "issue-1", { type: "SUBTASK", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
    // The CHECK constraint would reject this as a 500; the service turns it
    // into something a person can act on.
    expect(repo.updateWithVersion).not.toHaveBeenCalled();
  });
});

// BR-5 — a subtask is never planned on its own.
describe("the backlog", () => {
  it("refuses to reorder a subtask within it", async () => {
    repo.findDetail.mockResolvedValue(row({ type: "SUBTASK", parentId: "p1" }) as never);
    await expect(
      IssueService.reorder(actor, "sub-1", { scope: "backlog", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

// BR-11 — what rolls up, and what deliberately does not.
describe("the parent roll-up", () => {
  it("counts progress and sums minutes across parent and subtasks", async () => {
    repo.findDetail.mockResolvedValue(row({ estimateMinutes: 60 }) as never);
    repo.listSubtasks.mockResolvedValue([
      subtask({ id: "a", status: "DONE", estimateMinutes: 30 }),
      subtask({ id: "b", status: "TODO", estimateMinutes: 90 }),
      subtask({ id: "c", status: "IN_PROGRESS", estimateMinutes: null }),
    ] as never);

    const detail = await IssueService.get(actor, "issue-1");

    expect(detail.subtaskProgress).toEqual({
      total: 3,
      done: 1,
      estimateMinutes: 180,
    });
  });

  it("reports null minutes when nothing in the tree is estimated", async () => {
    repo.listSubtasks.mockResolvedValue([subtask({ estimateMinutes: null })] as never);
    const detail = await IssueService.get(actor, "issue-1");
    // Not 0 — "no work left" and "nobody has estimated this" are different
    // claims, and showing the first when you mean the second is a plan lying.
    expect(detail.subtaskProgress.estimateMinutes).toBeNull();
  });

  it("does not query subtasks for a type that cannot have them", async () => {
    repo.findDetail.mockResolvedValue(row({ type: "EPIC" }) as never);
    const detail = await IssueService.get(actor, "issue-1");
    expect(repo.listSubtasks).not.toHaveBeenCalled();
    expect(detail.canHaveSubtasks).toBe(false);
  });
});
