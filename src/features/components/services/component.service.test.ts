import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/components/repositories/component.repository", () => ({
  ComponentRepository: {
    listByProject: vi.fn(),
    findById: vi.fn(),
    findByNameCI: vi.fn(),
    listByIds: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    listIdsForIssue: vi.fn(),
    listForIssue: vi.fn(),
    setForIssue: vi.fn(),
  },
}));
vi.mock("@/features/issues/repositories/issue.repository", () => ({
  IssueRepository: {
    findProjectId: vi.fn(),
    assignIfUnassigned: vi.fn(),
    findNotificationContext: vi.fn(),
  },
}));
vi.mock("@/features/notifications/services/notification.service", () => ({
  NotificationService: { issueAssigned: vi.fn() },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { getContext: vi.fn(), getMemberRole: vi.fn() },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));

import { ComponentRepository } from "@/features/components/repositories/component.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { ComponentService } from "./component.service";
import { ForbiddenError } from "@/shared/lib/errors";

const repo = vi.mocked(ComponentRepository);
const issues = vi.mocked(IssueRepository);
const projects = vi.mocked(ProjectService);

const actor: Actor = { userId: "u-1", orgRole: "MEMBER", organizationId: "org-1" };
const ctx = {
  id: "p-1",
  organizationId: "org-1",
  key: "P",
  name: "P",
  status: "ACTIVE" as const,
  enforceTransitions: false,
};

beforeEach(() => {
  vi.resetAllMocks();
  projects.getContext.mockResolvedValue(ctx);
});

describe("ComponentService.create (BR-1 LEAD-only)", () => {
  it("forbids a MEMBER from creating", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await expect(
      ComponentService.create(actor, "p-1", { name: "API" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("ComponentService.setForIssue default-assignee (BR-3)", () => {
  beforeEach(() => {
    issues.findProjectId.mockResolvedValue({ id: "i-1", projectId: "p-1" } as never);
    issues.assignIfUnassigned.mockResolvedValue({ count: 1 } as never);
    issues.findNotificationContext.mockResolvedValue({
      id: "i-1",
      key: "P-1",
      title: "t",
      assigneeId: "lead-2",
      reporterId: "u-rep",
    } as never);
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.setForIssue.mockResolvedValue([] as never);
    repo.listForIssue.mockResolvedValue([] as never);
  });

  it("routes an unassigned issue to the first newly-added component's lead", async () => {
    repo.listByIds.mockResolvedValue([
      { id: "c-1", leadId: null },
      { id: "c-2", leadId: "lead-2" },
    ] as never);
    repo.listIdsForIssue.mockResolvedValue([]); // none before → both are added

    await ComponentService.setForIssue(actor, "i-1", ["c-1", "c-2"]);

    expect(issues.assignIfUnassigned).toHaveBeenCalledWith("i-1", "lead-2", "u-1");
  });

  it("does not route when the leaded component was already present", async () => {
    repo.listByIds.mockResolvedValue([{ id: "c-2", leadId: "lead-2" }] as never);
    repo.listIdsForIssue.mockResolvedValue(["c-2"]); // already there → not newly added

    await ComponentService.setForIssue(actor, "i-1", ["c-2"]);

    expect(issues.assignIfUnassigned).not.toHaveBeenCalled();
  });
});
