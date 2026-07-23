import { randomUUID } from "node:crypto";
import {
  AttachmentRepository,
  type AttachmentRow,
} from "@/features/attachments/repositories/attachment.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import {
  ProjectService,
  type ProjectContext,
} from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { getStorageAdapter } from "@/shared/lib/storage";
import {
  assertValidUpload,
  sanitizeFileName,
  MAX_ATTACHMENT_BYTES,
} from "@/features/attachments/validation/attachment.rules";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";
import type {
  AttachmentDto,
  AttachmentListDto,
} from "@/features/attachments/types/attachment.types";

// Business rules from docs/02_Modules/09_attachments.md. RBAC + validation live
// here; bytes go through the StorageAdapter seam (ADR-0017) — no provider SDK.

function canWrite(role: ProjectRoleDto | null): boolean {
  return role === "MEMBER" || role === "LEAD";
}

async function resolve(
  projectId: string,
  actor: Actor,
): Promise<{ context: ProjectContext; role: ProjectRoleDto | null }> {
  const context = await ProjectService.getContext(projectId);
  // Tenant scope (F-1): a project outside the caller's org is treated as absent.
  if (!context || context.organizationId !== actor.organizationId) {
    throw new NotFoundError("Issue not found.");
  }
  const role = await ProjectService.getMemberRole(projectId, actor.userId);
  return { context, role };
}

function toDto(
  row: AttachmentRow,
  actor: Actor,
  role: ProjectRoleDto | null,
  projectStatus: ProjectContext["status"],
): AttachmentDto {
  const writable = canWrite(role) && projectStatus !== "ARCHIVED";
  return {
    id: row.id,
    issueId: row.issueId,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt.toISOString(),
    downloadUrl: `/api/attachments/${row.id}/download`,
    canDelete: writable && (row.uploadedById === actor.userId || role === "LEAD"),
  };
}

export const AttachmentService = {
  async list(actor: Actor, issueId: string): Promise<AttachmentListDto> {
    const issue = await IssueRepository.findProjectId(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(issue.projectId, actor);
    const rows = await AttachmentRepository.listByIssue(issueId);
    return {
      items: rows.map((r) => toDto(r, actor, role, context.status)),
      canUpload: canWrite(role) && context.status !== "ARCHIVED",
      maxUploadBytes: MAX_ATTACHMENT_BYTES,
    };
  },

  // BR-1/BR-4: any MEMBER/LEAD uploads; size + MIME validated server-side; the
  // blob is stored under an opaque key (never the raw filename — ADR-0017 §3).
  async upload(
    actor: Actor,
    issueId: string,
    file: { fileName: string; mimeType: string; buffer: Buffer },
  ): Promise<AttachmentDto> {
    const issue = await IssueRepository.findProjectId(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(issue.projectId, actor);
    if (!canWrite(role)) {
      throw new ForbiddenError("You need to be a project member to upload files.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }

    const sizeBytes = file.buffer.byteLength;
    assertValidUpload(file.mimeType, sizeBytes);

    const storageKey = `attachments/${issueId}/${randomUUID()}`;
    await getStorageAdapter().upload({ storageKey, buffer: file.buffer, mimeType: file.mimeType });

    const row = await AttachmentRepository.create({
      issueId,
      uploadedById: actor.userId,
      fileName: sanitizeFileName(file.fileName),
      storageKey,
      mimeType: file.mimeType,
      sizeBytes,
    });
    await AuditLogService.record({
      organizationId: context.organizationId,
      actorId: actor.userId,
      action: "ATTACHMENT_UPLOADED",
      entityType: "Attachment",
      entityId: row.id,
      afterData: { issueId, fileName: row.fileName, sizeBytes },
    });
    return toDto(row, actor, role, context.status);
  },

  // BR-5: RBAC-gated download; the route proxies these bytes (no public URL).
  async download(
    actor: Actor,
    attachmentId: string,
  ): Promise<{ fileName: string; mimeType: string; body: Buffer }> {
    const existing = await AttachmentRepository.findById(attachmentId);
    if (!existing) throw new NotFoundError("Attachment not found.");
    await resolve(existing.issue.projectId, actor); // F-1 + existence
    const body = await getStorageAdapter().getObject(existing.storageKey);
    if (!body) throw new NotFoundError("File is no longer available.");
    return { fileName: existing.fileName, mimeType: existing.mimeType, body };
  },

  // BR-1/BR-6: uploader or LEAD deletes; row removed, blob best-effort.
  async delete(actor: Actor, attachmentId: string): Promise<void> {
    const existing = await AttachmentRepository.findById(attachmentId);
    if (!existing) throw new NotFoundError("Attachment not found.");
    const { context, role } = await resolve(existing.issue.projectId, actor);
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    const allowed =
      canWrite(role) && (existing.uploadedById === actor.userId || role === "LEAD");
    if (!allowed) {
      throw new ForbiddenError("Only the uploader or a project lead can delete this file.");
    }

    await AttachmentRepository.softDelete(attachmentId, actor.userId);
    // Best-effort blob removal — a storage failure must not block the user (BR-6).
    try {
      await getStorageAdapter().delete(existing.storageKey);
    } catch {
      // Orphaned object swept by a future cleanup job (ADR-0017 §5).
    }
    await AuditLogService.record({
      organizationId: context.organizationId,
      actorId: actor.userId,
      action: "ATTACHMENT_DELETED",
      entityType: "Attachment",
      entityId: attachmentId,
      afterData: { issueId: existing.issueId },
    });
  },
};
