import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

const storage = { upload: vi.fn(), getObject: vi.fn(), delete: vi.fn() };

vi.mock("@/features/attachments/repositories/attachment.repository", () => ({
  ATTACHMENT_LIST_LIMIT: 200,
  AttachmentRepository: {
    listByIssue: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
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
vi.mock("@/shared/lib/storage", () => ({ getStorageAdapter: () => storage }));

import { AttachmentRepository } from "@/features/attachments/repositories/attachment.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { AttachmentService } from "./attachment.service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";

const repo = vi.mocked(AttachmentRepository);
const issues = vi.mocked(IssueRepository);
const projects = vi.mocked(ProjectService);

const actor: Actor = { userId: "user-1", orgRole: "MEMBER", organizationId: "org-1" };
const ctx = {
  id: "proj-1",
  organizationId: "org-1",
  key: "ENG",
  name: "Engineering",
  status: "ACTIVE" as const,
  enforceTransitions: false,
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    issueId: "issue-1",
    fileName: "report.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1234,
    storageKey: "attachments/issue-1/uuid",
    uploadedById: "user-1",
    createdAt: new Date("2026-07-14T00:00:00Z"),
    uploadedBy: { id: "user-1", name: "Founder", avatarUrl: null },
    ...overrides,
  };
}

function detailRow(overrides: Record<string, unknown> = {}) {
  return { ...row(overrides), issue: { projectId: "proj-1" } };
}

beforeEach(() => {
  vi.resetAllMocks();
  projects.getContext.mockResolvedValue(ctx);
  issues.findProjectId.mockResolvedValue({ id: "issue-1", projectId: "proj-1" } as never);
  storage.upload.mockResolvedValue(undefined);
  storage.getObject.mockResolvedValue(Buffer.from("bytes"));
  storage.delete.mockResolvedValue(undefined);
});

describe("upload", () => {
  it("stores the blob under an opaque key and records the row (MEMBER)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.create.mockResolvedValue(row() as never);
    const dto = await AttachmentService.upload(actor, "issue-1", {
      fileName: "report.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("x".repeat(1234)),
    });
    expect(storage.upload).toHaveBeenCalledTimes(1);
    const key = storage.upload.mock.calls[0]![0].storageKey as string;
    expect(key.startsWith("attachments/issue-1/")).toBe(true);
    expect(key).not.toContain("report.pdf"); // opaque, not the filename
    expect(dto.downloadUrl).toBe("/api/attachments/att-1/download");
  });

  it("rejects a disallowed MIME type (415-worthy)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await expect(
      AttachmentService.upload(actor, "issue-1", {
        fileName: "evil.exe",
        mimeType: "application/x-msdownload",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it("rejects an oversize file (413-worthy)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    await expect(
      AttachmentService.upload(actor, "issue-1", {
        fileName: "big.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.alloc(25_000_001),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("forbids a VIEWER from uploading", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER");
    await expect(
      AttachmentService.upload(actor, "issue-1", {
        fileName: "a.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("x"),
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("download", () => {
  it("RBAC-gates and returns the bytes + metadata", async () => {
    projects.getMemberRole.mockResolvedValue("VIEWER"); // read is allowed
    repo.findById.mockResolvedValue(detailRow() as never);
    const out = await AttachmentService.download(actor, "att-1");
    expect(out.fileName).toBe("report.pdf");
    expect(out.body.toString()).toBe("bytes");
  });

  it("404s when the blob is gone", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.findById.mockResolvedValue(detailRow() as never);
    storage.getObject.mockResolvedValue(null);
    await expect(AttachmentService.download(actor, "att-1")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("treats an attachment in another org as absent (F-1)", async () => {
    projects.getContext.mockResolvedValue({ ...ctx, organizationId: "org-2" });
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.findById.mockResolvedValue(detailRow() as never);
    await expect(AttachmentService.download(actor, "att-1")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("delete", () => {
  it("lets the uploader delete (row + best-effort blob)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.findById.mockResolvedValue(detailRow({ uploadedById: "user-1" }) as never);
    await AttachmentService.delete(actor, "att-1");
    expect(repo.softDelete).toHaveBeenCalledWith("att-1", "user-1");
    expect(storage.delete).toHaveBeenCalledWith("attachments/issue-1/uuid");
  });

  it("lets a LEAD delete another member's file; a MEMBER cannot", async () => {
    projects.getMemberRole.mockResolvedValue("LEAD");
    repo.findById.mockResolvedValue(detailRow({ uploadedById: "other" }) as never);
    await AttachmentService.delete(actor, "att-1");
    expect(repo.softDelete).toHaveBeenCalled();

    vi.clearAllMocks();
    projects.getContext.mockResolvedValue(ctx);
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.findById.mockResolvedValue(detailRow({ uploadedById: "other" }) as never);
    await expect(AttachmentService.delete(actor, "att-1")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("still removes the row if the blob delete fails (BR-6)", async () => {
    projects.getMemberRole.mockResolvedValue("MEMBER");
    repo.findById.mockResolvedValue(detailRow({ uploadedById: "user-1" }) as never);
    storage.delete.mockRejectedValue(new Error("storage down"));
    await AttachmentService.delete(actor, "att-1");
    expect(repo.softDelete).toHaveBeenCalled();
  });
});
