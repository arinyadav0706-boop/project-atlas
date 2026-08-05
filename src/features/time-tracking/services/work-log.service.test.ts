import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/time-tracking/repositories/work-log.repository", () => ({
  DEFAULT_WORKLOG_PAGE_SIZE: 50,
  MAX_WORKLOG_PAGE_SIZE: 100,
  WorkLogRepository: {
    listByIssue: vi.fn(),
    sumMinutesByIssue: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    updateWithVersion: vi.fn(),
    softDelete: vi.fn(),
  },
}));
vi.mock("@/features/issues/repositories/issue.repository", () => ({
  IssueRepository: { findProjectAndEstimate: vi.fn(), setEstimate: vi.fn() },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { getContext: vi.fn(), getMemberRole: vi.fn() },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));

import { WorkLogRepository } from "@/features/time-tracking/repositories/work-log.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { WorkLogService } from "./work-log.service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";

const logs = vi.mocked(WorkLogRepository);
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
    id: "wl1",
    issueId: "issue-1",
    userId: "user-1",
    minutes: 90,
    workDate: new Date("2026-07-20T00:00:00.000Z"),
    note: "did x",
    version: 0,
    createdAt: new Date("2026-07-20T10:00:00.000Z"),
    user: { id: "user-1", name: "Ana", avatarUrl: null },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  issues.findProjectAndEstimate.mockResolvedValue({
    id: "issue-1",
    projectId: "proj-1",
    estimateMinutes: 240,
  } as never);
  projects.getContext.mockResolvedValue(ctx as never);
  projects.getMemberRole.mockResolvedValue("MEMBER" as never);
});

describe("list", () => {
  it("returns items + a correct summary (remaining = estimate − logged)", async () => {
    logs.listByIssue.mockResolvedValue([row()] as never);
    logs.sumMinutesByIssue.mockResolvedValue(90 as never);
    const page = await WorkLogService.list(actor, "issue-1");
    expect(page.summary).toEqual({ estimateMinutes: 240, loggedMinutes: 90, remainingMinutes: 150 });
    expect(page.canLog).toBe(true);
    expect(page.items[0]!.canEdit).toBe(true); // author
  });

  it("remaining is negative when over-logged; null when no estimate", async () => {
    issues.findProjectAndEstimate.mockResolvedValue({ id: "issue-1", projectId: "proj-1", estimateMinutes: 60 } as never);
    logs.listByIssue.mockResolvedValue([] as never);
    logs.sumMinutesByIssue.mockResolvedValue(90 as never);
    let page = await WorkLogService.list(actor, "issue-1");
    expect(page.summary.remainingMinutes).toBe(-30);

    issues.findProjectAndEstimate.mockResolvedValue({ id: "issue-1", projectId: "proj-1", estimateMinutes: null } as never);
    page = await WorkLogService.list(actor, "issue-1");
    expect(page.summary.remainingMinutes).toBeNull();
  });

  it("404s a cross-tenant issue (F-1)", async () => {
    projects.getContext.mockResolvedValue({ ...ctx, organizationId: "other-org" } as never);
    logs.sumMinutesByIssue.mockResolvedValue(0 as never);
    await expect(WorkLogService.list(actor, "issue-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("create", () => {
  it("logs time for a MEMBER", async () => {
    logs.create.mockResolvedValue(row() as never);
    const dto = await WorkLogService.create(actor, "issue-1", { minutes: 90, workDate: "2026-07-20" });
    expect(dto.minutes).toBe(90);
    expect(dto.workDate).toBe("2026-07-20");
  });

  it("forbids a VIEWER", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER" as never);
    await expect(
      WorkLogService.create(actor, "issue-1", { minutes: 30, workDate: "2026-07-20" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("409s on an archived project", async () => {
    projects.getContext.mockResolvedValue({ ...ctx, status: "ARCHIVED" } as never);
    await expect(
      WorkLogService.create(actor, "issue-1", { minutes: 30, workDate: "2026-07-20" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("update", () => {
  it("lets the author edit their own log", async () => {
    logs.findById.mockResolvedValue({ ...row(), issue: { projectId: "proj-1" } } as never);
    logs.updateWithVersion.mockResolvedValue(row({ minutes: 120, version: 1 }) as never);
    const dto = await WorkLogService.update(actor, "wl1", { minutes: 120, workDate: "2026-07-20", expectedVersion: 0 });
    expect(dto.minutes).toBe(120);
  });

  it("forbids editing someone else's log (even a LEAD)", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD" as never);
    logs.findById.mockResolvedValue({ ...row({ userId: "user-2" }), issue: { projectId: "proj-1" } } as never);
    await expect(
      WorkLogService.update(actor, "wl1", { minutes: 120, workDate: "2026-07-20", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("409s on a stale version (OCC)", async () => {
    logs.findById.mockResolvedValue({ ...row(), issue: { projectId: "proj-1" } } as never);
    logs.updateWithVersion.mockResolvedValue(null as never);
    await expect(
      WorkLogService.update(actor, "wl1", { minutes: 120, workDate: "2026-07-20", expectedVersion: 0 }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("delete", () => {
  it("lets the author delete their own", async () => {
    logs.findById.mockResolvedValue({ ...row(), issue: { projectId: "proj-1" } } as never);
    logs.softDelete.mockResolvedValue({ id: "wl1" } as never);
    await expect(WorkLogService.delete(actor, "wl1")).resolves.toBeUndefined();
  });

  it("lets a LEAD delete another user's log (moderation)", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD" as never);
    logs.findById.mockResolvedValue({ ...row({ userId: "user-2" }), issue: { projectId: "proj-1" } } as never);
    logs.softDelete.mockResolvedValue({ id: "wl1" } as never);
    await expect(WorkLogService.delete(actor, "wl1")).resolves.toBeUndefined();
  });

  it("forbids a MEMBER deleting another user's log", async () => {
    logs.findById.mockResolvedValue({ ...row({ userId: "user-2" }), issue: { projectId: "proj-1" } } as never);
    await expect(WorkLogService.delete(actor, "wl1")).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("setEstimate", () => {
  it("a LEAD sets the estimate and gets the refreshed summary", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD" as never);
    issues.setEstimate.mockResolvedValue({ id: "issue-1", estimateMinutes: 300 } as never);
    logs.sumMinutesByIssue.mockResolvedValue(120 as never);
    const summary = await WorkLogService.setEstimate(actor, "issue-1", { estimateMinutes: 300 });
    expect(summary).toEqual({ estimateMinutes: 300, loggedMinutes: 120, remainingMinutes: 180 });
  });

  it("forbids a MEMBER (estimate is a LEAD planning decision, BR-5)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER" as never);
    await expect(
      WorkLogService.setEstimate(actor, "issue-1", { estimateMinutes: 300 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("forbids a VIEWER", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER" as never);
    await expect(
      WorkLogService.setEstimate(actor, "issue-1", { estimateMinutes: 300 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
