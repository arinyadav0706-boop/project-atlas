import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/sprints/repositories/sprint.repository", () => ({
  SprintRepository: {
    create: vi.fn(),
    listByProject: vi.fn(),
    findById: vi.fn(),
    findCurrent: vi.fn(),
    listPlanning: vi.fn(),
    listCompleted: vi.fn(),
    reorderQueue: vi.fn(),
    update: vi.fn(),
    start: vi.fn(),
    complete: vi.fn(),
    progressByStatus: vi.fn(),
    listSprintIssues: vi.fn(),
    releaseIssues: vi.fn(),
    softDelete: vi.fn(),
    statusOf: vi.fn(),
  },
}));
vi.mock("@/features/issues/repositories/issue.repository", () => ({
  IssueRepository: {
    findDetail: vi.fn(),
    findRankInSprint: vi.fn(),
    findRankInBacklog: vi.fn(),
    moveToSprintWithVersion: vi.fn(),
  },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { getContext: vi.fn(), getMemberRole: vi.fn() },
}));
// Sprint membership history (ADR-0037 §2) — moving an issue now writes an
// audit row, so the service reaches the audit layer on that path.
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));

import { SprintRepository } from "@/features/sprints/repositories/sprint.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { SprintService } from "./sprint.service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/errors";

const sprints = vi.mocked(SprintRepository);
const issues = vi.mocked(IssueRepository);
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

function sprintRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "sprint-1",
    projectId: "proj-1",
    name: "Sprint 1",
    goal: null,
    status: "PLANNED",
    startDate: null,
    endDate: null,
    ...overrides,
  };
}

function issueRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "issue-1",
    projectId: "proj-1",
    key: "ENG-1",
    type: "TASK",
    title: "A",
    description: null,
    status: "TODO",
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
  sprints.progressByStatus.mockResolvedValue([] as never);
  sprints.listCompleted.mockResolvedValue([] as never);
  sprints.listPlanning.mockResolvedValue([] as never);
  sprints.listSprintIssues.mockResolvedValue([] as never);
});

describe("create", () => {
  it("lets a LEAD create a sprint", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    sprints.create.mockResolvedValue(sprintRow() as never);
    const s = await SprintService.create(actor, "proj-1", { name: "Sprint 1" });
    expect(s.name).toBe("Sprint 1");
    expect(s.canManage).toBe(true);
  });

  it("forbids a MEMBER from creating a sprint (BR-4)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await expect(
      SprintService.create(actor, "proj-1", { name: "X" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("treats a project in another org as absent (F-1)", async () => {
    projects.getContext.mockResolvedValue({ ...ctx, organizationId: "org-2" });
    projects.getMemberRole.mockResolvedValue("LEAD");
    await expect(
      SprintService.create(actor, "proj-1", { name: "X" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("start", () => {
  beforeEach(() => projects.getMemberRole.mockResolvedValue("LEAD"));

  it("rejects starting without dates (BR-2)", async () => {
    sprints.findById.mockResolvedValue(sprintRow() as never);
    await expect(SprintService.start(actor, "sprint-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("rejects endDate <= startDate (BR-2)", async () => {
    sprints.findById.mockResolvedValue(
      sprintRow({
        startDate: new Date("2026-08-10T00:00:00Z"),
        endDate: new Date("2026-08-01T00:00:00Z"),
      }) as never,
    );
    await expect(SprintService.start(actor, "sprint-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("returns 409-worthy conflict when another sprint is already active (BR-1)", async () => {
    sprints.findById.mockResolvedValue(
      sprintRow({
        startDate: new Date("2026-08-01T00:00:00Z"),
        endDate: new Date("2026-08-14T00:00:00Z"),
      }) as never,
    );
    sprints.start.mockResolvedValue({ ok: false, reason: "ANOTHER_ACTIVE" } as never);
    await expect(SprintService.start(actor, "sprint-1")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("starts a valid planned sprint", async () => {
    sprints.findById.mockResolvedValue(
      sprintRow({
        startDate: new Date("2026-08-01T00:00:00Z"),
        endDate: new Date("2026-08-14T00:00:00Z"),
      }) as never,
    );
    sprints.start.mockResolvedValue({
      ok: true,
      sprint: sprintRow({ status: "ACTIVE" }),
    } as never);
    const s = await SprintService.start(actor, "sprint-1");
    expect(s.status).toBe("ACTIVE");
  });

  it("forbids a MEMBER from starting (BR-4)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    sprints.findById.mockResolvedValue(sprintRow() as never);
    await expect(SprintService.start(actor, "sprint-1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("complete", () => {
  it("completes an ACTIVE sprint (LEAD)", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    sprints.findById.mockResolvedValue(sprintRow({ status: "ACTIVE" }) as never);
    sprints.complete.mockResolvedValue({
      sprint: sprintRow({ status: "COMPLETED" }),
      returnedCount: 2,
    } as never);
    const s = await SprintService.complete(actor, "sprint-1");
    expect(s.status).toBe("COMPLETED");
  });

  it("rejects completing a non-active sprint", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    sprints.findById.mockResolvedValue(sprintRow({ status: "PLANNED" }) as never);
    await expect(SprintService.complete(actor, "sprint-1")).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("moves incomplete issues to a chosen PLANNED follow-up sprint (FUT-5)", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    sprints.findById.mockImplementation(((id: string) =>
      Promise.resolve(
        id === "sprint-1"
          ? sprintRow({ id: "sprint-1", status: "ACTIVE" })
          : sprintRow({ id: "next", status: "PLANNED" }),
      )) as never);
    sprints.complete.mockResolvedValue({
      sprint: sprintRow({ status: "COMPLETED" }),
      returnedCount: 1,
    } as never);
    await SprintService.complete(actor, "sprint-1", "next");
    expect(sprints.complete).toHaveBeenCalledWith("sprint-1", "proj-1", "user-1", "next");
  });

  it("rejects a follow-up target that is not PLANNED", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    sprints.findById.mockImplementation(((id: string) =>
      Promise.resolve(
        id === "sprint-1"
          ? sprintRow({ id: "sprint-1", status: "ACTIVE" })
          : sprintRow({ id: "done", status: "COMPLETED" }),
      )) as never);
    await expect(SprintService.complete(actor, "sprint-1", "done")).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(sprints.complete).not.toHaveBeenCalled();
  });
});

describe("update (date cross-field, BR-2)", () => {
  it("rejects an edit that makes endDate <= startDate", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    sprints.findById.mockResolvedValue(
      sprintRow({ startDate: new Date("2026-08-10T00:00:00Z") }) as never,
    );
    await expect(
      SprintService.update(actor, "sprint-1", { endDate: "2026-08-01T00:00:00Z" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("progress (BR-7, derived)", () => {
  it("sums counts and points, marking DONE as done", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    sprints.progressByStatus.mockResolvedValue([
      { status: "TODO", _count: { _all: 2 }, _sum: { storyPoints: 5 } },
      { status: "DONE", _count: { _all: 3 }, _sum: { storyPoints: 8 } },
    ] as never);
    sprints.listByProject.mockResolvedValue([sprintRow({ status: "ACTIVE" })] as never);
    const list = await SprintService.list(actor, "proj-1");
    expect(list[0]!.progress).toEqual({
      totalIssues: 5,
      doneIssues: 3,
      totalStoryPoints: 13,
      doneStoryPoints: 8,
    });
  });
});

describe("delete", () => {
  it("lets a LEAD delete a PLANNED sprint (releases issues + soft delete)", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    sprints.findById.mockResolvedValue(sprintRow({ status: "PLANNED" }) as never);
    await SprintService.delete(actor, "sprint-1");
    expect(sprints.releaseIssues).toHaveBeenCalledWith("sprint-1", "user-1");
    expect(sprints.softDelete).toHaveBeenCalledWith("sprint-1", "user-1");
  });

  it("blocks deleting an ACTIVE sprint (must complete first)", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    sprints.findById.mockResolvedValue(sprintRow({ status: "ACTIVE" }) as never);
    await expect(SprintService.delete(actor, "sprint-1")).rejects.toBeInstanceOf(ConflictError);
    expect(sprints.softDelete).not.toHaveBeenCalled();
  });

  it("forbids a MEMBER from deleting a sprint (BR-4)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    sprints.findById.mockResolvedValue(sprintRow({ status: "PLANNED" }) as never);
    await expect(SprintService.delete(actor, "sprint-1")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("reorderQueue (FUT-8)", () => {
  it("reindexes when given all the planning sprints (LEAD)", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    sprints.listPlanning.mockResolvedValue([
      sprintRow({ id: "a" }),
      sprintRow({ id: "b" }),
    ] as never);
    await SprintService.reorderQueue(actor, "proj-1", ["b", "a"]);
    expect(sprints.reorderQueue).toHaveBeenCalledWith(["b", "a"], "user-1");
  });

  it("rejects a stale list (missing/extra ids)", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    sprints.listPlanning.mockResolvedValue([sprintRow({ id: "a" }), sprintRow({ id: "b" })] as never);
    await expect(
      SprintService.reorderQueue(actor, "proj-1", ["a"]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(sprints.reorderQueue).not.toHaveBeenCalled();
  });

  it("forbids a MEMBER from reordering (BR-4)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await expect(
      SprintService.reorderQueue(actor, "proj-1", ["a"]),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("getPanel", () => {
  it("returns every non-completed sprint as a section, each with its issues", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    sprints.listPlanning.mockResolvedValue([
      sprintRow({ id: "active-1", status: "ACTIVE" }),
      sprintRow({ id: "plan-1", status: "PLANNED" }),
    ] as never);
    sprints.listSprintIssues.mockResolvedValue([] as never);
    const panel = await SprintService.getPanel(actor, "proj-1");
    expect(panel.sprints.map((s) => s.sprint.id)).toEqual(["active-1", "plan-1"]);
  });

  it("includes completed sprints with progress", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    sprints.listPlanning.mockResolvedValue([] as never);
    sprints.listCompleted.mockResolvedValue([sprintRow({ id: "old", status: "COMPLETED" })] as never);
    const panel = await SprintService.getPanel(actor, "proj-1");
    expect(panel.completedSprints).toHaveLength(1);
    expect(panel.completedSprints[0]!.status).toBe("COMPLETED");
  });

  it("reports canManage for a LEAD even when there are NO sprints yet (regression)", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    sprints.listPlanning.mockResolvedValue([] as never);
    const panel = await SprintService.getPanel(actor, "proj-1");
    expect(panel.sprints).toHaveLength(0);
    expect(panel.canManage).toBe(true); // the "Create sprint" control gate
  });

  it("does not grant canManage to a MEMBER", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    sprints.listPlanning.mockResolvedValue([] as never);
    const panel = await SprintService.getPanel(actor, "proj-1");
    expect(panel.canManage).toBe(false);
    expect(panel.canWrite).toBe(true);
  });
});

describe("moveIssue (BR-6/BR-5, ADR-0014)", () => {
  beforeEach(() => projects.getMemberRole.mockResolvedValue("MEMBER"));

  it("assigns a backlog issue into a sprint with a rank between neighbours", async () => {
    issues.findDetail.mockResolvedValue(issueRow({ sprintId: null }) as never);
    sprints.findById.mockResolvedValue(sprintRow({ status: "ACTIVE" }) as never);
    issues.findRankInSprint.mockImplementation(((id: string) =>
      Promise.resolve(
        id === "b" ? { id: "b", rank: "a1" } : id === "a" ? { id: "a", rank: "a3" } : null,
      )) as never);
    issues.moveToSprintWithVersion.mockResolvedValue(
      issueRow({ sprintId: "sprint-1", rank: "a2", version: 1 }) as never,
    );

    const moved = await SprintService.moveIssue(actor, "issue-1", {
      sprintId: "sprint-1",
      beforeId: "b",
      afterId: "a",
      expectedVersion: 0,
    });

    expect(issues.findRankInSprint).toHaveBeenCalledWith("b", "proj-1", "sprint-1");
    const [, , data] = issues.moveToSprintWithVersion.mock.calls[0]!;
    expect(data.sprintId).toBe("sprint-1");
    expect(data.rank > "a1" && data.rank < "a3").toBe(true);
    expect(moved.version).toBe(1);
  });

  // Sprint membership history (ADR-0037 §2). Burndown v2 replays these rows,
  // so writing one for a mere reorder would invent a scope change that never
  // happened — and not writing one on a real move loses that history for good.
  it("records ISSUE_SPRINT_CHANGED when the issue changes sprint", async () => {
    issues.findDetail.mockResolvedValue(issueRow({ sprintId: null }) as never);
    sprints.findById.mockResolvedValue(sprintRow({ status: "ACTIVE" }) as never);
    issues.findRankInSprint.mockResolvedValue(null as never);
    issues.moveToSprintWithVersion.mockResolvedValue(
      issueRow({ sprintId: "sprint-1", version: 1 }) as never,
    );

    await SprintService.moveIssue(actor, "issue-1", {
      sprintId: "sprint-1",
      expectedVersion: 0,
    });

    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ISSUE_SPRINT_CHANGED",
        entityId: "issue-1",
        beforeData: { sprintId: null },
        afterData: { sprintId: "sprint-1" },
      }),
    );
  });

  it("records nothing when the move is a reorder inside the same sprint", async () => {
    issues.findDetail.mockResolvedValue(issueRow({ sprintId: "sprint-1" }) as never);
    sprints.findById.mockResolvedValue(sprintRow({ status: "ACTIVE" }) as never);
    issues.findRankInSprint.mockResolvedValue(null as never);
    issues.moveToSprintWithVersion.mockResolvedValue(
      issueRow({ sprintId: "sprint-1", version: 1 }) as never,
    );

    await SprintService.moveIssue(actor, "issue-1", {
      sprintId: "sprint-1",
      expectedVersion: 0,
    });

    expect(audit.record).not.toHaveBeenCalled();
  });

  it("returns an issue to the backlog when sprintId is null", async () => {
    issues.findDetail.mockResolvedValue(
      issueRow({ sprintId: "sprint-1" }) as never,
    );
    sprints.statusOf.mockResolvedValue("ACTIVE");
    issues.findRankInBacklog.mockResolvedValue(null);
    issues.moveToSprintWithVersion.mockResolvedValue(
      issueRow({ sprintId: null, version: 1 }) as never,
    );
    await SprintService.moveIssue(actor, "issue-1", {
      sprintId: null,
      beforeId: null,
      afterId: null,
      expectedVersion: 0,
    });
    const [, , data] = issues.moveToSprintWithVersion.mock.calls[0]!;
    expect(data.sprintId).toBeNull();
  });

  it("rejects moving an issue OUT of a COMPLETED sprint (BR-5)", async () => {
    issues.findDetail.mockResolvedValue(issueRow({ sprintId: "old" }) as never);
    sprints.statusOf.mockResolvedValue("COMPLETED");
    await expect(
      SprintService.moveIssue(actor, "issue-1", {
        sprintId: null,
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(issues.moveToSprintWithVersion).not.toHaveBeenCalled();
  });

  it("rejects moving an issue INTO a COMPLETED sprint (BR-5)", async () => {
    issues.findDetail.mockResolvedValue(issueRow({ sprintId: null }) as never);
    sprints.findById.mockResolvedValue(sprintRow({ status: "COMPLETED" }) as never);
    await expect(
      SprintService.moveIssue(actor, "issue-1", {
        sprintId: "sprint-1",
        expectedVersion: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(issues.moveToSprintWithVersion).not.toHaveBeenCalled();
  });

  it("forbids a VIEWER from moving issues (BR-4)", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER");
    issues.findDetail.mockResolvedValue(issueRow() as never);
    await expect(
      SprintService.moveIssue(actor, "issue-1", { sprintId: "sprint-1", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a stale version (lost update, ADR-0011)", async () => {
    issues.findDetail.mockResolvedValue(issueRow({ sprintId: null }) as never);
    sprints.findById.mockResolvedValue(sprintRow({ status: "ACTIVE" }) as never);
    issues.moveToSprintWithVersion.mockResolvedValue(null as never);
    await expect(
      SprintService.moveIssue(actor, "issue-1", { sprintId: "sprint-1", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
