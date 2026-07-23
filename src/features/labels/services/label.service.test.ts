import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/labels/repositories/label.repository", () => ({
  LabelRepository: {
    listByOrg: vi.fn(),
    findById: vi.fn(),
    findByNameCI: vi.fn(),
    listByIds: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    listForIssue: vi.fn(),
    setForIssue: vi.fn(),
  },
}));
vi.mock("@/features/issues/repositories/issue.repository", () => ({
  IssueRepository: { findProjectId: vi.fn() },
}));
vi.mock("@/features/projects/services/project.service", () => ({
  ProjectService: { getContext: vi.fn(), getMemberRole: vi.fn(), isLeadAnywhere: vi.fn() },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));

import { LabelRepository } from "@/features/labels/repositories/label.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { LabelService } from "./label.service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";

const repo = vi.mocked(LabelRepository);
const issues = vi.mocked(IssueRepository);
const projects = vi.mocked(ProjectService);

const actor: Actor = { userId: "u-1", orgRole: "MEMBER", organizationId: "org-1" };

beforeEach(() => {
  vi.resetAllMocks();
  projects.isLeadAnywhere.mockResolvedValue(false);
});

describe("LabelService.create", () => {
  it("rejects a case-insensitive duplicate", async () => {
    repo.findByNameCI.mockResolvedValue({
      id: "l-9",
      name: "Bug",
      color: "#000000",
      organizationId: "org-1",
    } as never);
    await expect(
      LabelService.create(actor, { name: "bug", color: "#111111" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("creates when the name is free", async () => {
    repo.findByNameCI.mockResolvedValue(null);
    repo.create.mockResolvedValue({ id: "l-1", name: "bug", color: "#111111" } as never);
    await expect(LabelService.create(actor, { name: "bug", color: "#111111" })).resolves.toMatchObject(
      { id: "l-1" },
    );
  });
});

describe("LabelService manage-gate (BR-2)", () => {
  it("forbids a non-lead member from updating", async () => {
    repo.findById.mockResolvedValue({
      id: "l-1",
      name: "bug",
      color: "#000",
      organizationId: "org-1",
    } as never);
    projects.isLeadAnywhere.mockResolvedValue(false); // not a lead anywhere
    await expect(
      LabelService.update(actor, "l-1", { name: "defect" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an org ADMIN to update", async () => {
    const admin: Actor = { ...actor, orgRole: "ADMIN" };
    repo.findById.mockResolvedValue({
      id: "l-1",
      name: "bug",
      color: "#000",
      organizationId: "org-1",
    } as never);
    repo.findByNameCI.mockResolvedValue(null);
    repo.update.mockResolvedValue({ id: "l-1", name: "defect", color: "#000" } as never);
    await expect(LabelService.update(admin, "l-1", { name: "defect" })).resolves.toMatchObject({
      name: "defect",
    });
  });
});

describe("LabelService.setForIssue", () => {
  beforeEach(() => {
    issues.findProjectId.mockResolvedValue({ id: "i-1", projectId: "p-1" } as never);
    projects.getContext.mockResolvedValue({
      id: "p-1",
      organizationId: "org-1",
      key: "P",
      name: "P",
      status: "ACTIVE",
    } as never);
    projects.getMemberRole.mockResolvedValue("MEMBER");
  });

  it("rejects ids that aren't live org labels", async () => {
    repo.listByIds.mockResolvedValue([{ id: "l-1" }] as never); // only 1 of 2 found
    await expect(
      LabelService.setForIssue(actor, "i-1", ["l-1", "l-ghost"]),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.setForIssue).not.toHaveBeenCalled();
  });

  it("forbids a VIEWER from applying labels", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER");
    await expect(LabelService.setForIssue(actor, "i-1", [])).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
