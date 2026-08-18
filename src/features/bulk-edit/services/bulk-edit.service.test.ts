import { beforeEach, describe, expect, it, vi } from "vitest";
import { BulkEditService } from "@/features/bulk-edit/services/bulk-edit.service";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { SprintRepository } from "@/features/sprints/repositories/sprint.repository";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { NotificationService } from "@/features/notifications/services/notification.service";
import { bulkEditSchema } from "@/features/bulk-edit/validation/bulk-edit.schemas";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/issues/repositories/issue.repository", () => ({
  IssueRepository: { findDetail: vi.fn(), updateWithVersion: vi.fn() },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { getContext: vi.fn(), getMemberRole: vi.fn() },
}));
vi.mock("@/features/sprints/repositories/sprint.repository", () => ({
  SprintRepository: { findById: vi.fn() },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));
vi.mock("@/features/notifications/services/notification.service", () => ({
  NotificationService: { issueAssigned: vi.fn() },
}));

const issues = vi.mocked(IssueRepository);
const projects = vi.mocked(ProjectService);
const sprints = vi.mocked(SprintRepository);
const audit = vi.mocked(AuditLogService);
const notify = vi.mocked(NotificationService);

const actor = { userId: "u1", organizationId: "org-1", orgRole: "MEMBER" } as Actor;

function issue(over: Record<string, unknown> = {}) {
  return {
    id: "i1",
    key: "VWP-1",
    title: "Thing",
    projectId: "p1",
    status: "TODO",
    priority: "MEDIUM",
    assigneeId: null,
    sprintId: null,
    version: 3,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  issues.findDetail.mockResolvedValue(issue() as never);
  issues.updateWithVersion.mockImplementation(((id: string) =>
    Promise.resolve(issue({ id, key: "VWP-1" }))) as never);
  projects.getContext.mockResolvedValue({
    id: "p1",
    organizationId: "org-1",
    status: "ACTIVE",
  } as never);
  projects.getMemberRole.mockResolvedValue("MEMBER" as never);
});

const run = (ids: string[], changes: Record<string, unknown>) =>
  BulkEditService.apply(actor, bulkEditSchema.parse({ issueIds: ids, changes }));

describe("per-issue evaluation (BR-3)", () => {
  it("one issue's failure does not block the others", async () => {
    issues.findDetail.mockImplementation(((id: string) =>
      Promise.resolve(id === "bad" ? null : issue({ id }))) as never);
    const result = await run(["a", "bad", "c"], { priority: "HIGH" });
    expect(result.updated).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results.find((r) => r.issueId === "bad")).toMatchObject({
      outcome: "failed",
      reason: "not_found",
    });
  });

  it("reports a forbidden issue rather than dropping it (BR-4)", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER" as never);
    const result = await run(["a"], { priority: "HIGH" });
    expect(result.results[0]).toMatchObject({ outcome: "failed", reason: "forbidden" });
    expect(issues.updateWithVersion).not.toHaveBeenCalled();
  });

  it("refuses issues in archived projects (BR-5)", async () => {
    projects.getContext.mockResolvedValue({
      id: "p1",
      organizationId: "org-1",
      status: "ARCHIVED",
    } as never);
    const result = await run(["a"], { priority: "HIGH" });
    expect(result.results[0]).toMatchObject({ outcome: "failed", reason: "archived" });
  });

  it("treats a cross-org project as absent, not forbidden (F-1)", async () => {
    projects.getContext.mockResolvedValue({
      id: "p1",
      organizationId: "other-org",
      status: "ACTIVE",
    } as never);
    const result = await run(["a"], { priority: "HIGH" });
    expect(result.results[0]).toMatchObject({ reason: "not_found" });
  });
});

describe("workflow (BR-6)", () => {
  it("refuses a status jump that skips a stage", async () => {
    const result = await run(["a"], { status: "DONE" }); // from TODO
    expect(result.results[0]).toMatchObject({
      outcome: "failed",
      reason: "invalid_transition",
    });
    expect(issues.updateWithVersion).not.toHaveBeenCalled();
  });

  it("allows a legal step", async () => {
    const result = await run(["a"], { status: "IN_PROGRESS" });
    expect(result.updated).toBe(1);
  });
});

describe("no-op detection (BR-7)", () => {
  it("skips an issue that already holds every requested value", async () => {
    issues.findDetail.mockResolvedValue(issue({ priority: "HIGH" }) as never);
    const result = await run(["a"], { priority: "HIGH" });
    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);
    expect(issues.updateWithVersion).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("writes only the fields that actually differ", async () => {
    issues.findDetail.mockResolvedValue(issue({ priority: "HIGH" }) as never);
    await run(["a"], { priority: "HIGH", status: "IN_PROGRESS" });
    expect(issues.updateWithVersion.mock.calls[0]![2]).toEqual({ status: "IN_PROGRESS" });
  });
});

// ADR-0041 §2 — the subtlety that keeps single-issue OCC working.
describe("optimistic concurrency", () => {
  it("passes the issue's current version, so the write still increments it", async () => {
    await run(["a"], { priority: "HIGH" });
    expect(issues.updateWithVersion.mock.calls[0]![1]).toBe(3);
  });

  it("reports a lost update rather than retrying over it", async () => {
    issues.updateWithVersion.mockResolvedValue(null as never);
    const result = await run(["a"], { priority: "HIGH" });
    expect(result.results[0]).toMatchObject({ outcome: "failed", reason: "conflict" });
  });
});

describe("assignee and sprint must belong to the issue's project", () => {
  it("fails an assignee who is not a project member (BR-8)", async () => {
    projects.getMemberRole.mockImplementation(((_p: string, userId: string) =>
      Promise.resolve(userId === "u1" ? "MEMBER" : null)) as never);
    const result = await run(["a"], { assigneeId: "outsider" });
    expect(result.results[0]).toMatchObject({ reason: "invalid_assignee" });
  });

  it("fails a sprint from another project (BR-9)", async () => {
    sprints.findById.mockResolvedValue({ id: "s1", projectId: "other" } as never);
    const result = await run(["a"], { sprintId: "s1" });
    expect(result.results[0]).toMatchObject({ reason: "invalid_sprint" });
  });

  it("clears the assignee when given null (BR-10)", async () => {
    issues.findDetail.mockResolvedValue(issue({ assigneeId: "someone" }) as never);
    await run(["a"], { assigneeId: null });
    expect(issues.updateWithVersion.mock.calls[0]![2]).toEqual({ assigneeId: null });
  });
});

describe("audit and notifications", () => {
  it("audits a bulk status change like a single one (BR-12)", async () => {
    await run(["a"], { status: "IN_PROGRESS" });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ISSUE_STATUS_CHANGED",
        beforeData: { status: "TODO" },
        afterData: { status: "IN_PROGRESS" },
      }),
    );
  });

  it("does not audit a priority-only change", async () => {
    await run(["a"], { priority: "HIGH" });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("caps assignment notifications and says so (BR-13)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER" as never);
    const ids = Array.from({ length: 30 }, (_, i) => `i${i}`);
    issues.findDetail.mockImplementation(((id: string) =>
      Promise.resolve(issue({ id }))) as never);

    const result = await run(ids, { assigneeId: "u2" });
    expect(result.updated).toBe(30);
    expect(notify.issueAssigned).toHaveBeenCalledTimes(25);
    expect(result.notificationsSuppressed).toBe(true);
  });

  it("does not notify when you assign work to yourself", async () => {
    await run(["a"], { assigneeId: "u1" });
    expect(notify.issueAssigned).not.toHaveBeenCalled();
  });
});

describe("request validation", () => {
  it("rejects an empty change set (BR-2)", () => {
    expect(() => bulkEditSchema.parse({ issueIds: ["a"], changes: {} })).toThrow();
  });

  it("rejects more than 100 ids (BR-1)", () => {
    const ids = Array.from({ length: 101 }, (_, i) => `i${i}`);
    expect(() => bulkEditSchema.parse({ issueIds: ids, changes: { priority: "HIGH" } })).toThrow();
  });

  it("de-duplicates ids so one issue cannot be written twice", () => {
    const parsed = bulkEditSchema.parse({
      issueIds: ["a", "a", "b"],
      changes: { priority: "HIGH" },
    });
    expect(parsed.issueIds).toEqual(["a", "b"]);
  });
});
