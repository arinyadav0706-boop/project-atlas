import {
  CommentRepository,
  DEFAULT_COMMENT_PAGE_SIZE,
  MAX_COMMENT_PAGE_SIZE,
  type CommentRow,
} from "@/features/comments/repositories/comment.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import {
  ProjectService,
  type ProjectContext,
} from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { NotificationService } from "@/features/notifications/services/notification.service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { ProjectRoleDto } from "@/features/projects/types/project.types";
import { elevate, canWriteContent } from "@/features/authorization/permission";
import type {
  CommentDto,
  CommentPageDto,
} from "@/features/comments/types/comment.types";
import type {
  CreateCommentInput,
  UpdateCommentInput,
} from "@/features/comments/validation/comment.schemas";

// Business rules from docs/02_Modules/08_comments.md. RBAC + the audit/event seam
// (ADR-0016) are enforced here, server-side. Prisma lives only in repositories.

const canWrite = canWriteContent;

async function resolve(
  projectId: string,
  actor: Actor,
): Promise<{ context: ProjectContext; role: ProjectRoleDto | null }> {
  const context = await ProjectService.getContext(projectId);
  // Tenant scope (F-1): a project outside the caller's org is treated as absent.
  if (!context || context.organizationId !== actor.organizationId) {
    throw new NotFoundError("Issue not found.");
  }
  const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));
  return { context, role };
}

function toDto(
  row: CommentRow,
  actor: Actor,
  role: ProjectRoleDto | null,
  projectStatus: ProjectContext["status"],
): CommentDto {
  const writable = canWrite(role) && projectStatus !== "ARCHIVED";
  const isAuthor = row.authorId === actor.userId;
  return {
    id: row.id,
    issueId: row.issueId,
    parentCommentId: row.parentCommentId,
    body: row.body,
    bodyFormat: row.bodyFormat,
    author: row.author,
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    version: row.version,
    canEdit: writable && isAuthor,
    canDelete: writable && (isAuthor || role === "LEAD"),
  };
}

// The audit + future-event seam (ADR-0016): the single place notifications,
// real-time, and AI summaries will hook into. MVP records an audit entry.
async function recordEvent(
  organizationId: string,
  actorId: string,
  action: "COMMENT_CREATED" | "COMMENT_UPDATED" | "COMMENT_DELETED",
  commentId: string,
  issueId: string,
): Promise<void> {
  await AuditLogService.record({
    organizationId,
    actorId,
    action,
    entityType: "Comment",
    entityId: commentId,
    afterData: { issueId },
  });
}

export const CommentService = {
  // BR-2: an issue's comments, oldest-first, keyset-paginated. Any org member who
  // can see the project may read (F-1); `canComment` gates the composer.
  async list(
    actor: Actor,
    issueId: string,
    page: { cursor?: string; take?: number } = {},
  ): Promise<CommentPageDto> {
    const issue = await IssueRepository.findProjectId(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(issue.projectId, actor);

    const pageSize = Math.min(page.take ?? DEFAULT_COMMENT_PAGE_SIZE, MAX_COMMENT_PAGE_SIZE);
    const rows = await CommentRepository.listByIssue(issueId, {
      cursor: page.cursor,
      take: pageSize,
    });
    const hasMore = rows.length > pageSize;
    const items = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? (items.at(-1)?.id ?? null) : null;

    return {
      items: items.map((r) => toDto(r, actor, role, context.status)),
      nextCursor,
      canComment: canWrite(role) && context.status !== "ARCHIVED",
    };
  },

  // BR-1: any MEMBER/LEAD may comment on an issue they can see.
  async create(
    actor: Actor,
    issueId: string,
    input: CreateCommentInput,
  ): Promise<CommentDto> {
    const issue = await IssueRepository.findProjectId(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolve(issue.projectId, actor);
    if (!canWrite(role)) {
      throw new ForbiddenError("You need to be a project member to comment.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }

    const row = await CommentRepository.create({
      issueId,
      authorId: actor.userId,
      body: input.body,
      parentCommentId: input.parentCommentId ?? null,
    });
    await recordEvent(context.organizationId, actor.userId, "COMMENT_CREATED", row.id, issueId);
    // Notify the issue's assignee + reporter of the new comment (ADR-0019).
    const target = await IssueRepository.findNotificationContext(issueId);
    if (target) {
      await NotificationService.issueCommented(actor, {
        issueId,
        issueKey: target.key,
        recipientIds: [target.assigneeId, target.reporterId],
      });
    }
    return toDto(row, actor, role, context.status);
  },

  // BR-3: only the author may edit; OCC (ADR-0011) rejects a stale edit.
  async update(
    actor: Actor,
    commentId: string,
    input: UpdateCommentInput,
  ): Promise<CommentDto> {
    const existing = await CommentRepository.findById(commentId);
    if (!existing) throw new NotFoundError("Comment not found.");
    const { context, role } = await resolve(existing.issue.projectId, actor);
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    if (existing.authorId !== actor.userId) {
      throw new ForbiddenError("You can only edit your own comments.");
    }

    const row = await CommentRepository.updateWithVersion(
      commentId,
      input.expectedVersion,
      input.body,
      actor.userId,
    );
    if (!row) {
      throw new ConflictError(
        "This comment was changed since you opened it — refresh and reapply your edit.",
      );
    }
    await recordEvent(context.organizationId, actor.userId, "COMMENT_UPDATED", row.id, row.issueId);
    return toDto(row, actor, role, context.status);
  },

  // BR-4: the author may delete their own; a LEAD may delete any (moderation).
  async delete(actor: Actor, commentId: string): Promise<void> {
    const existing = await CommentRepository.findById(commentId);
    if (!existing) throw new NotFoundError("Comment not found.");
    const { context, role } = await resolve(existing.issue.projectId, actor);
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    const allowed =
      canWrite(role) && (existing.authorId === actor.userId || role === "LEAD");
    if (!allowed) {
      throw new ForbiddenError("Only the author or a project lead can delete this comment.");
    }
    await CommentRepository.softDelete(commentId, actor.userId);
    await recordEvent(
      context.organizationId,
      actor.userId,
      "COMMENT_DELETED",
      commentId,
      existing.issueId,
    );
  },
};
