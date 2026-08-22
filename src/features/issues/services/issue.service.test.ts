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
    listEpics: vi.fn(),
    listChildren: vi.fn(),
    detachChildren: vi.fn(),
    // Subtasks (ADR-0045). Spied rather than stubbed so the cascade and the
    // BR-7 guard can be asserted; sensible defaults are restored in beforeEach,
    // which runs after `resetAllMocks` strips them.
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
  ProjectService: {
    getContext: vi.fn(),
    getMemberRole: vi.fn(),
  },
}));
vi.mock("@/features/workflow/services/workflow.service", () => ({
  WorkflowService: {
    requireStatus: vi.fn(),
    assertTransitionAllowed: vi.fn(),
    reachableStatuses: vi.fn(),
  },
}));

vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));
// Personalization is a best-effort side-signal (ADR-0012); stub it so these
// unit tests don't reach the recent-items DB.
vi.mock("@/features/home/services/recent-item.service", () => ({
  RecentItemService: { record: vi.fn() },
}));
// Issue creation now consults custom fields for required-field enforcement
// (ADR-0042 §4). Plain async stubs rather than `vi.fn().mockResolvedValue()`:
// these suites call `vi.resetAllMocks()` in beforeEach, which strips a mock's
// implementation and would leave `missingRequired` returning undefined.
vi.mock("@/features/custom-fields/services/custom-field.service", () => ({
  CustomFieldService: {
    missingRequired: async () => [],
    setForIssue: async () => [],
  },
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
  NotificationService: { issueAssigned: vi.fn(), issueStatusChanged: vi.fn(), issueCommented: vi.fn() },
}));

import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { WorkflowService } from "@/features/workflow/services/workflow.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { IssueService } from "./issue.service";
import { ConflictError, ForbiddenError, ValidationError } from "@/shared/lib/errors";

const repo = vi.mocked(IssueRepository);
const workflow = vi.mocked(WorkflowService);
const projects = vi.mocked(ProjectService);
const audit = vi.mocked(AuditLogService);

const actor: Actor = { userId: "user-1", orgRole: "MEMBER", organizationId: "org-1" };

const ctx = {
  id: "proj-1",
  organizationId: "org-1",
  key: "ENG",
  name: "Engineering",
  status: "ACTIVE" as const,
  enforceTransitions: false,
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
    statusId: "st-todo",
    workflowStatus: {
      id: "st-todo",
      name: "To Do",
      category: "TODO",
      color: "slate",
      position: 0,
      isDefault: true,
    },
    priority: "MEDIUM",
    assigneeId: null,
    reporterId: "user-1",
    sprintId: null,
    epicId: null,
    storyPoints: null,
    rank: "a0",
    version: 0,
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
  // `get` and `delete` now consult the subtask tree for every issue that could
  // have one. Defaults of "none" keep every pre-subtask test describing exactly
  // what it did before; the subtask suite overrides them per case.
  repo.listSubtasks.mockResolvedValue([] as never);
  repo.countSubtasks.mockResolvedValue(0 as never);
  repo.countOpenSubtasks.mockResolvedValue(0 as never);
  repo.softDeleteSubtasks.mockResolvedValue({ count: 0 } as never);
  // Statuses are per-project data now (ADR-0049). Defaults describe the seeded
  // four, so every pre-workflow test keeps meaning what it meant; the cases
  // that care override them.
  workflow.reachableStatuses.mockResolvedValue([
    { id: "st-todo", name: "To Do", category: "TODO", color: "slate", position: 0, isDefault: true },
    { id: "st-ip", name: "In Progress", category: "IN_PROGRESS", color: "sky", position: 1, isDefault: false },
    { id: "st-done", name: "Done", category: "DONE", color: "emerald", position: 3, isDefault: false },
  ]);
  workflow.assertTransitionAllowed.mockResolvedValue(undefined);
  workflow.requireStatus.mockImplementation(async (_projectId, statusId) => {
    const byId: Record<string, { id: string; name: string; category: "TODO" | "IN_PROGRESS" | "DONE"; color: string; position: number; isDefault: boolean }> = {
      "st-todo": { id: "st-todo", name: "To Do", category: "TODO", color: "slate", position: 0, isDefault: true },
      "st-ip": { id: "st-ip", name: "In Progress", category: "IN_PROGRESS", color: "sky", position: 1, isDefault: false },
      "st-done": { id: "st-done", name: "Done", category: "DONE", color: "emerald", position: 3, isDefault: false },
    };
    return byId[statusId]!;
  });
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

  it("a LEAD may set an estimate at creation (ADR-0030 BR-5)", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    repo.createWithKey.mockResolvedValue(issueRow({ key: "ENG-8" }) as never);
    await IssueService.create(actor, "proj-1", {
      type: "TASK",
      title: "x",
      priority: "MEDIUM",
      estimateMinutes: 480,
    });
    expect(repo.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({ estimateMinutes: 480 }),
    );
  });

  it("forbids a MEMBER from setting an estimate at creation (BR-5)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await expect(
      IssueService.create(actor, "proj-1", {
        type: "TASK",
        title: "x",
        priority: "MEDIUM",
        estimateMinutes: 480,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an org ADMIN with no project role to create (effective LEAD, ADR-0024)", async () => {
    projects.getMemberRole.mockResolvedValue(null); // not a member…
    repo.createWithKey.mockResolvedValue(issueRow({ key: "ENG-9" }) as never);
    const dto = await IssueService.create(
      { userId: "admin-1", orgRole: "ADMIN", organizationId: "org-1" },
      "proj-1",
      { type: "TASK", title: "x", priority: "MEDIUM" },
    );
    // …but elevated to LEAD, so the create succeeds and records the admin as reporter.
    expect(dto.key).toBe("ENG-9");
    expect(repo.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({ reporterId: "admin-1", projectId: "proj-1" }),
    );
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
    projects.getContext.mockResolvedValue({ ...ctx, status: "ARCHIVED", enforceTransitions: false });
    projects.getMemberRole.mockResolvedValue("LEAD");
    await expect(
      IssueService.create(actor, "proj-1", { type: "TASK", title: "x", priority: "MEDIUM" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("transition", () => {
  // The old fixed graph (To Do → In Progress → In Review → Done, no skipping)
  // is gone with ADR-0049. It was stricter than ClickUp, Asana AND Jira's
  // default workflow, all of which let you move anything anywhere, and it could
  // not survive per-project statuses anyway: a project may have three columns
  // in one category. Restriction is now opt-in, per project, and enforced by
  // the workflow layer — so these tests assert that the service ASKS it.
  it("moves straight to Done when the project has not restricted transitions", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO" }) as never);
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.setStatusWithVersion.mockResolvedValue(issueRow({ status: "DONE" }) as never);

    await IssueService.transition(actor, "issue-1", "st-done", 0);

    expect(workflow.assertTransitionAllowed).toHaveBeenCalledWith(
      "proj-1",
      "st-todo",
      "st-done",
    );
    expect(repo.setStatusWithVersion).toHaveBeenCalled();
  });

  it("refuses when the project's rules refuse — the guard is not advisory", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO" }) as never);
    projects.getMemberRole.mockResolvedValue("MEMBER");
    workflow.assertTransitionAllowed.mockRejectedValue(
      new ConflictError("This project restricts status changes."),
    );

    await expect(
      IssueService.transition(actor, "issue-1", "st-done", 0),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.setStatusWithVersion).not.toHaveBeenCalled();
  });

  it("performs a legal transition and audit-logs it (BR-6)", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO" }) as never);
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.setStatusWithVersion.mockResolvedValue(
      issueRow({ status: "IN_PROGRESS" }) as never,
    );

    await IssueService.transition(actor, "issue-1", "st-ip", 0);

    // Both halves of the invariant, in one call (30_workflow BR-2).
    expect(repo.setStatusWithVersion).toHaveBeenCalledWith(
      "issue-1",
      0,
      { id: "st-ip", category: "IN_PROGRESS" },
      "user-1",
    );
    // The audit line names the STATUS, because "IN_REVIEW -> IN_REVIEW" tells a
    // reader nothing on a project with three review columns.
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ISSUE_STATUS_CHANGED",
        beforeData: { status: "To Do", category: "TODO" },
        afterData: { status: "In Progress", category: "IN_PROGRESS" },
      }),
    );
  });

  it("rejects a stale version (lost update) with a conflict, no audit (ADR-0011)", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO" }) as never);
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.setStatusWithVersion.mockResolvedValue(null as never); // version moved on

    await expect(
      IssueService.transition(actor, "issue-1", "st-ip", 0),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(audit.record).not.toHaveBeenCalled();
  });
});

describe("update (edit)", () => {
  beforeEach(() => projects.getMemberRole.mockResolvedValue("MEMBER"));

  it("applies an edit at the expected version", async () => {
    repo.findDetail.mockResolvedValue(issueRow() as never);
    repo.updateWithVersion.mockResolvedValue(issueRow({ title: "New" }) as never);

    const dto = await IssueService.update(actor, "issue-1", {
      title: "New",
      expectedVersion: 3,
    });

    const [, expectedVersion] = repo.updateWithVersion.mock.calls[0]!;
    expect(expectedVersion).toBe(3);
    expect(dto.title).toBe("New");
  });

  it("rejects a stale edit (lost update) with a conflict (ADR-0011)", async () => {
    repo.findDetail.mockResolvedValue(issueRow() as never);
    repo.updateWithVersion.mockResolvedValue(null as never);

    await expect(
      IssueService.update(actor, "issue-1", { title: "New", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ConflictError);
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
    repo.reorderWithVersion.mockResolvedValue(issueRow({ rank: "a2" }) as never);

    await IssueService.reorder(actor, "issue-1", {
      beforeId: "before-1",
      afterId: "after-1",
      expectedVersion: 0,
    });

    const [, expectedVersion, data] = repo.reorderWithVersion.mock.calls[0]!;
    expect(expectedVersion).toBe(0); // the version the client dragged from
    expect(data.rank > "a1" && data.rank < "a3").toBe(true);
    expect(data.status).toBeUndefined(); // same-column reorder: no status write
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("applies the workflow check and audits when the column changes (BR-3)", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO", rank: "a0" }) as never);
    repo.findRankInColumn.mockResolvedValue(null); // dropped at an empty column end
    repo.reorderWithVersion.mockResolvedValue(
      issueRow({ status: "IN_PROGRESS" }) as never,
    );

    await IssueService.reorder(actor, "issue-1", {
      statusId: "st-ip",
      expectedVersion: 0,
    });

    const [, , data] = repo.reorderWithVersion.mock.calls[0]!;
    // Both halves together (30_workflow BR-2).
    expect(data.status).toEqual({ id: "st-ip", category: "IN_PROGRESS" });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ISSUE_STATUS_CHANGED",
        afterData: { status: "In Progress", category: "IN_PROGRESS" },
      }),
    );
  });

  it("rejects a stale version (lost update) with a conflict and no audit (ADR-0011)", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO", rank: "a0" }) as never);
    repo.findRankInColumn.mockResolvedValue(null);
    // The conditional write matched no row → the card changed since the client read it.
    repo.reorderWithVersion.mockResolvedValue(null as never);

    await expect(
      IssueService.reorder(actor, "issue-1", {
        statusId: "st-ip",
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(audit.record).not.toHaveBeenCalled();
  });

  // A board drag must answer to the project's rules exactly as the status menu
  // does. Guarding only the menu would leave the board as the way round the
  // rule, which is worse than not having the rule at all.
  it("refuses a column move the project's rules refuse, before any write", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO" }) as never);
    workflow.assertTransitionAllowed.mockRejectedValue(
      new ConflictError("This project restricts status changes."),
    );
    await expect(
      IssueService.reorder(actor, "issue-1", { statusId: "st-done", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.reorderWithVersion).not.toHaveBeenCalled();
  });

  it("forbids a VIEWER from reordering (BR-5)", async () => {
    repo.findDetail.mockResolvedValue(issueRow() as never);
    projects.getMemberRole.mockResolvedValue("VIEWER");
    await expect(
      IssueService.reorder(actor, "issue-1", {
        beforeId: null,
        afterId: null,
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a neighbour that is not in the destination column (stale client)", async () => {
    repo.findDetail.mockResolvedValue(issueRow({ status: "TODO" }) as never);
    repo.findRankInColumn.mockResolvedValue(null); // beforeId not found in column
    await expect(
      IssueService.reorder(actor, "issue-1", { beforeId: "ghost", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.reorderWithVersion).not.toHaveBeenCalled();
  });

  it("rejects positioning a card relative to itself", async () => {
    repo.findDetail.mockResolvedValue(issueRow() as never);
    await expect(
      IssueService.reorder(actor, "issue-1", { beforeId: "issue-1", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a reorder on an archived project", async () => {
    projects.getContext.mockResolvedValue({ ...ctx, status: "ARCHIVED", enforceTransitions: false });
    repo.findDetail.mockResolvedValue(issueRow() as never);
    await expect(
      IssueService.reorder(actor, "issue-1", {
        beforeId: null,
        afterId: null,
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  // Backlog scope (ADR-0013): neighbours validated against the backlog, never a
  // status column; status is never changed by a backlog drag.
  describe("scope=backlog", () => {
    it("validates neighbours as unscheduled and writes rank only (no status)", async () => {
      projects.getMemberRole.mockResolvedValue("MEMBER");
      repo.findDetail.mockResolvedValue(
        issueRow({ status: "IN_PROGRESS", sprintId: null, rank: "a5" }) as never,
      );
      repo.findRankInBacklog.mockImplementation(((id: string) =>
        Promise.resolve(
          id === "before-1"
            ? { id: "before-1", rank: "a1" }
            : id === "after-1"
              ? { id: "after-1", rank: "a3" }
              : null,
        )) as never);
      repo.reorderWithVersion.mockResolvedValue(issueRow({ rank: "a2" }) as never);

      await IssueService.reorder(actor, "issue-1", {
        scope: "backlog",
        beforeId: "before-1",
        afterId: "after-1",
        expectedVersion: 0,
      });

      // Neighbours checked against the backlog, not a column.
      expect(repo.findRankInBacklog).toHaveBeenCalledWith("before-1", "proj-1");
      expect(repo.findRankInColumn).not.toHaveBeenCalled();
      const [, , data] = repo.reorderWithVersion.mock.calls[0]!;
      expect(data.rank > "a1" && data.rank < "a3").toBe(true);
      expect(data.status).toBeUndefined(); // a backlog drag never changes status
      expect(audit.record).not.toHaveBeenCalled();
    });

    it("rejects a backlog reorder of an issue already in a sprint", async () => {
      projects.getMemberRole.mockResolvedValue("MEMBER");
      repo.findDetail.mockResolvedValue(
        issueRow({ sprintId: "sprint-1" }) as never,
      );
      await expect(
        IssueService.reorder(actor, "issue-1", {
          scope: "backlog",
          beforeId: null,
          afterId: null,
          expectedVersion: 0,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(repo.reorderWithVersion).not.toHaveBeenCalled();
    });

    it("rejects a status change requested under scope=backlog", async () => {
      projects.getMemberRole.mockResolvedValue("MEMBER");
      repo.findDetail.mockResolvedValue(
        issueRow({ status: "TODO", sprintId: null }) as never,
      );
      await expect(
        IssueService.reorder(actor, "issue-1", {
          scope: "backlog",
          statusId: "st-ip",
          expectedVersion: 0,
        }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repo.reorderWithVersion).not.toHaveBeenCalled();
    });

    it("rejects a neighbour that is no longer in the backlog (stale client)", async () => {
      projects.getMemberRole.mockResolvedValue("MEMBER");
      repo.findDetail.mockResolvedValue(issueRow({ sprintId: null }) as never);
      repo.findRankInBacklog.mockResolvedValue(null); // beforeId not unscheduled
      await expect(
        IssueService.reorder(actor, "issue-1", {
          scope: "backlog",
          beforeId: "ghost",
          expectedVersion: 0,
        }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(repo.reorderWithVersion).not.toHaveBeenCalled();
    });
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

describe("epic hierarchy (ADR-0026)", () => {
  it("creates a child under a valid epic and persists epicId", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.findEpic.mockResolvedValue({ id: "epic-1" } as never);
    repo.createWithKey.mockResolvedValue(issueRow({ epicId: "epic-1" }) as never);
    const dto = await IssueService.create(actor, "proj-1", {
      type: "TASK",
      title: "child",
      priority: "MEDIUM",
      epicId: "epic-1",
    });
    expect(repo.findEpic).toHaveBeenCalledWith("proj-1", "epic-1");
    expect(repo.createWithKey).toHaveBeenCalledWith(
      expect.objectContaining({ epicId: "epic-1" }),
    );
    expect(dto.epicId).toBe("epic-1");
  });

  it("rejects creating an Epic that has a parent epic", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await expect(
      IssueService.create(actor, "proj-1", {
        type: "EPIC",
        title: "epic",
        priority: "MEDIUM",
        epicId: "epic-1",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createWithKey).not.toHaveBeenCalled();
  });

  it("rejects a non-epic / cross-project parent (findEpic returns null)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.findEpic.mockResolvedValue(null);
    await expect(
      IssueService.create(actor, "proj-1", {
        type: "TASK",
        title: "child",
        priority: "MEDIUM",
        epicId: "not-an-epic",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("update: assigns and removes an epic", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.findDetail.mockResolvedValue(issueRow() as never);
    repo.findEpic.mockResolvedValue({ id: "epic-1" } as never);
    repo.updateWithVersion.mockResolvedValue(issueRow({ epicId: "epic-1" }) as never);
    await IssueService.update(actor, "issue-1", { epicId: "epic-1", expectedVersion: 0 });
    expect(repo.updateWithVersion).toHaveBeenCalledWith(
      "issue-1",
      0,
      expect.objectContaining({ epicId: "epic-1" }),
      "user-1",
    );

    // Remove (epicId: null) — no findEpic lookup needed.
    repo.updateWithVersion.mockResolvedValue(issueRow({ epicId: null }) as never);
    await IssueService.update(actor, "issue-1", { epicId: null, expectedVersion: 0 });
    expect(repo.updateWithVersion).toHaveBeenLastCalledWith(
      "issue-1",
      0,
      expect.objectContaining({ epicId: null }),
      "user-1",
    );
  });

  it("update: rejects making an issue its own parent", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.findDetail.mockResolvedValue(issueRow() as never); // id issue-1
    await expect(
      IssueService.update(actor, "issue-1", { epicId: "issue-1", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("update: rejects converting an Epic that still has children to another type", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    repo.findDetail.mockResolvedValue(issueRow({ type: "EPIC" }) as never);
    repo.listChildren.mockResolvedValue([{ id: "c1" }] as never);
    await expect(
      IssueService.update(actor, "issue-1", { type: "TASK", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("delete: detaches an epic's children before soft delete", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    repo.findDetail.mockResolvedValue(issueRow({ type: "EPIC" }) as never);
    repo.detachChildren.mockResolvedValue({ count: 2 } as never);
    repo.softDelete.mockResolvedValue(issueRow() as never);
    await IssueService.delete(actor, "issue-1");
    expect(repo.detachChildren).toHaveBeenCalledWith("issue-1", "user-1");
    expect(repo.softDelete).toHaveBeenCalledWith("issue-1", "user-1");
  });

  it("delete: a non-epic does not touch detachChildren", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    repo.findDetail.mockResolvedValue(issueRow({ type: "TASK" }) as never);
    repo.softDelete.mockResolvedValue(issueRow() as never);
    await IssueService.delete(actor, "issue-1");
    expect(repo.detachChildren).not.toHaveBeenCalled();
  });

  it("get: an epic returns its child issues; a child returns its parent", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    // Epic → children populated.
    repo.findDetail.mockResolvedValue(issueRow({ type: "EPIC" }) as never);
    repo.listChildren.mockResolvedValue([
      { id: "c1", key: "ENG-2", title: "child", type: "TASK", status: "TODO" },
    ] as never);
    const epicDto = await IssueService.get(actor, "issue-1");
    expect(epicDto.children).toHaveLength(1);
    expect(epicDto.children[0]?.key).toBe("ENG-2");

    // Child → parent epic summary from the row include; no children query.
    repo.findDetail.mockResolvedValue(
      issueRow({ type: "TASK", epicId: "epic-1", epic: { id: "epic-1", key: "ENG-1", title: "Epic" } }) as never,
    );
    const childDto = await IssueService.get(actor, "issue-1");
    expect(childDto.epic).toMatchObject({ id: "epic-1", key: "ENG-1" });
    expect(childDto.children).toEqual([]);
  });

  it("listEpics returns the project's epics", async () => {
    repo.listEpics.mockResolvedValue([{ id: "epic-1", key: "ENG-1", title: "Epic" }] as never);
    const epics = await IssueService.listEpics(actor, "proj-1");
    expect(epics).toEqual([{ id: "epic-1", key: "ENG-1", title: "Epic" }]);
  });
});
