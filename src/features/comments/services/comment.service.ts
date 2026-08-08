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
  CommentThreadDto,
  MentionableUserDto,
} from "@/features/comments/types/comment.types";
import { parseMentions, plainPreview } from "@/features/comments/lib/mentions";
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
  extra: { replyCount?: number; replies?: CommentDto[] } = {},
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
    // Read back off the body rather than joining `comment_mentions`: the body
    // is the source of truth (ADR-0038 §1), so this cannot drift from what the
    // reader actually sees, and it costs no query.
    mentions: parseMentions(row.body).map((m) => ({ userId: m.userId, name: m.name })),
    replyCount: extra.replyCount ?? 0,
    replies: extra.replies ?? [],
  };
}

/**
 * Resolve the mentions in a body to real, mentionable users.
 *
 * No cap, by decision (ADR-0038 §2) — naming a whole team is legitimate. What
 * this does enforce is that every id is a live user in the actor's own
 * organization: the composer only offers visible people, but a body can be
 * hand-crafted, and the composer is not a security boundary.
 */
async function resolveMentions(body: string, organizationId: string): Promise<string[]> {
  const parsed = parseMentions(body);
  if (parsed.length === 0) return [];
  return CommentRepository.resolveMentionableIds(
    parsed.map((m) => m.userId),
    organizationId,
  );
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

    // Reply counts and previews for this page's roots only — both are bounded
    // by the page size, so the issue view costs the same whether a thread has
    // three replies or three hundred (ADR-0038 §4).
    const rootIds = items.map((r) => r.id);
    const [counts, previews, totalCount] = await Promise.all([
      CommentRepository.replyCounts(rootIds),
      CommentRepository.previewReplies(rootIds),
      CommentRepository.countTopLevel(issueId),
    ]);

    return {
      items: items.map((r) =>
        toDto(r, actor, role, context.status, {
          replyCount: counts.get(r.id) ?? 0,
          replies: (previews.get(r.id) ?? []).map((reply) =>
            toDto(reply, actor, role, context.status),
          ),
        }),
      ),
      nextCursor,
      canComment: canWrite(role) && context.status !== "ARCHIVED",
      totalCount,
    };
  },

  /**
   * One thread's own page (ADR-0038 §4): the root plus a keyset page of every
   * reply. A long discussion gets a URL instead of an ever-growing issue view.
   */
  async thread(
    actor: Actor,
    commentId: string,
    page: { cursor?: string; take?: number } = {},
  ): Promise<CommentThreadDto> {
    const root = await CommentRepository.findById(commentId);
    if (!root) throw new NotFoundError("Comment not found.");
    // A reply has no thread of its own — send the caller to the real root
    // rather than rendering a page that is a lie about the structure.
    if (root.parentCommentId) {
      throw new NotFoundError("Comment not found.");
    }
    const { context, role } = await resolve(root.issue.projectId, actor);

    const issue = await IssueRepository.findNotificationContext(root.issueId);
    if (!issue) throw new NotFoundError("Issue not found.");

    const pageSize = Math.min(page.take ?? DEFAULT_COMMENT_PAGE_SIZE, MAX_COMMENT_PAGE_SIZE);
    const rows = await CommentRepository.listReplies(commentId, {
      cursor: page.cursor,
      take: pageSize,
    });
    const hasMore = rows.length > pageSize;
    const replies = hasMore ? rows.slice(0, pageSize) : rows;
    const counts = await CommentRepository.replyCounts([commentId]);

    return {
      root: toDto(root, actor, role, context.status, {
        replyCount: counts.get(commentId) ?? 0,
      }),
      replies: replies.map((r) => toDto(r, actor, role, context.status)),
      nextCursor: hasMore ? (replies.at(-1)?.id ?? null) : null,
      canComment: canWrite(role) && context.status !== "ARCHIVED",
      replyCount: counts.get(commentId) ?? 0,
      issue: {
        id: root.issueId,
        key: issue.key,
        title: issue.title,
        projectId: root.issue.projectId,
      },
    };
  },

  // Autocomplete candidates for the composer. Read-only and org-scoped; the
  // caller must be able to see the project, so this cannot be used as a
  // directory probe from outside.
  async mentionable(
    actor: Actor,
    issueId: string,
    query: string,
  ): Promise<MentionableUserDto[]> {
    const issue = await IssueRepository.findProjectId(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const { context } = await resolve(issue.projectId, actor);
    return CommentRepository.searchMentionable(
      context.organizationId,
      issue.projectId,
      query.trim(),
    );
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

    // Threads are one level deep (ADR-0038 §4). Replying to a reply attaches to
    // the same root instead of nesting, so the structure the UI renders is the
    // structure the database holds — no depth handling anywhere downstream.
    let parentCommentId = input.parentCommentId ?? null;
    if (parentCommentId) {
      const parent = await CommentRepository.findById(parentCommentId);
      if (!parent || parent.issueId !== issueId) {
        throw new NotFoundError("The comment you replied to no longer exists.");
      }
      parentCommentId = parent.parentCommentId ?? parent.id;
    }

    const mentionedUserIds = await resolveMentions(input.body, context.organizationId);

    const row = await CommentRepository.create({
      issueId,
      authorId: actor.userId,
      body: input.body,
      parentCommentId,
      mentionedUserIds,
    });
    await recordEvent(context.organizationId, actor.userId, "COMMENT_CREATED", row.id, issueId);

    const target = await IssueRepository.findNotificationContext(issueId);
    if (target) {
      // Participation is the signal a person cares (ADR-0038 §3): assignee,
      // reporter, and everyone who has already commented here.
      const participants = await CommentRepository.participantIds(issueId);
      await NotificationService.commentPosted(actor, {
        issueId,
        issueKey: target.key,
        commentId: row.id,
        preview: plainPreview(input.body),
        mentionedIds: mentionedUserIds,
        participantIds: [target.assigneeId, target.reporterId, ...participants],
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

    // The mention index is derived from the body, so an edit rebuilds it.
    const mentionedUserIds = await resolveMentions(input.body, context.organizationId);
    // Only people the edit *added* get notified. Re-notifying everyone already
    // named would turn a typo fix into a second ping for the whole thread.
    const previouslyMentioned = new Set(parseMentions(existing.body).map((m) => m.userId));
    const newlyMentioned = mentionedUserIds.filter((id) => !previouslyMentioned.has(id));

    const row = await CommentRepository.updateWithVersion(
      commentId,
      input.expectedVersion,
      input.body,
      actor.userId,
      mentionedUserIds,
    );
    if (!row) {
      throw new ConflictError(
        "This comment was changed since you opened it — refresh and reapply your edit.",
      );
    }
    await recordEvent(context.organizationId, actor.userId, "COMMENT_UPDATED", row.id, row.issueId);

    if (newlyMentioned.length > 0) {
      const target = await IssueRepository.findNotificationContext(row.issueId);
      if (target) {
        await NotificationService.commentPosted(actor, {
          issueId: row.issueId,
          issueKey: target.key,
          commentId: row.id,
          preview: plainPreview(input.body),
          mentionedIds: newlyMentioned,
          // An edit is not a new comment, so nobody is notified for
          // participation — only the people this edit actually named.
          participantIds: [],
        });
      }
    }
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
