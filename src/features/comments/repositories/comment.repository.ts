import { prisma } from "@/shared/lib/db";
import type { Prisma } from "@prisma/client";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §4).
// The comment write path is small and single-owner; RBAC + audit live in the service.

const authorSelect = {
  select: { id: true, name: true, avatarUrl: true },
} as const;

const commentSelect = {
  id: true,
  issueId: true,
  parentCommentId: true,
  body: true,
  bodyFormat: true,
  authorId: true,
  editedAt: true,
  version: true,
  createdAt: true,
  author: authorSelect,
} as const;

// Keyset pagination — never return an unbounded thread (Performance doc, standard
// #1). `id` is the final tiebreaker for a total, stable order.
export const DEFAULT_COMMENT_PAGE_SIZE = 50;
export const MAX_COMMENT_PAGE_SIZE = 100;

// How many replies ride along with each top-level comment on the issue page.
// Beyond this the thread gets its own page (ADR-0038 §4), so this number is the
// only thing standing between one popular thread and an unbounded issue view.
export const REPLY_PREVIEW_SIZE = 3;

export const CommentRepository = {
  // One page of an issue's **top-level** comments, oldest-first. Fetches
  // `take + 1` so the service can detect a further page.
  //
  // `parentCommentId: null` is the change from flat rendering: replies are no
  // longer interleaved into the main list, they hang off their root.
  listByIssue(issueId: string, page: { cursor?: string; take?: number } = {}) {
    const take = Math.min(page.take ?? DEFAULT_COMMENT_PAGE_SIZE, MAX_COMMENT_PAGE_SIZE);
    return prisma.comment.findMany({
      where: { issueId, parentCommentId: null, deletedAt: null },
      select: commentSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
  },

  // Live reply counts for a bounded set of roots, in one grouped query rather
  // than one count per comment. Roots with no replies are simply absent.
  async replyCounts(rootIds: string[]): Promise<Map<string, number>> {
    if (rootIds.length === 0) return new Map();
    const rows = await prisma.comment.groupBy({
      by: ["parentCommentId"],
      where: { parentCommentId: { in: rootIds }, deletedAt: null },
      _count: { _all: true },
    });
    return new Map(
      rows
        .filter((r): r is typeof r & { parentCommentId: string } => r.parentCommentId !== null)
        .map((r) => [r.parentCommentId, r._count._all]),
    );
  },

  /**
   * The newest few replies for each root, for the issue-page preview.
   *
   * Deliberately N queries for N roots rather than one window function: Prisma
   * cannot express `ROW_NUMBER() OVER (PARTITION BY …)` without raw SQL, and N
   * is bounded by the comment page size. Each query is an index seek on
   * (parentCommentId, createdAt). Newest-first per ADR-0038 §5 — the useful
   * question about a thread you have seen is "what happened since".
   */
  async previewReplies(rootIds: string[], perRoot = REPLY_PREVIEW_SIZE) {
    if (rootIds.length === 0) return new Map<string, CommentRow[]>();
    const pages = await Promise.all(
      rootIds.map((rootId) =>
        prisma.comment.findMany({
          where: { parentCommentId: rootId, deletedAt: null },
          select: commentSelect,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: perRoot,
        }),
      ),
    );
    // Flip each page back to reading order once the newest have been chosen.
    return new Map(rootIds.map((id, i) => [id, [...pages[i]!].reverse()]));
  },

  // Full reply list for one root, oldest-first — the thread page.
  listReplies(rootId: string, page: { cursor?: string; take?: number } = {}) {
    const take = Math.min(page.take ?? DEFAULT_COMMENT_PAGE_SIZE, MAX_COMMENT_PAGE_SIZE);
    return prisma.comment.findMany({
      where: { parentCommentId: rootId, deletedAt: null },
      select: commentSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
  },

  /**
   * Everyone who has already commented on the issue — the participation signal
   * (ADR-0038 §3). Distinct at the database, not in memory, so a 500-comment
   * issue returns ~10 rows rather than 500.
   */
  async participantIds(issueId: string): Promise<string[]> {
    const rows = await prisma.comment.findMany({
      where: { issueId, deletedAt: null },
      select: { authorId: true },
      distinct: ["authorId"],
    });
    return rows.map((r) => r.authorId);
  },

  countByIssue(issueId: string) {
    return prisma.comment.count({ where: { issueId, deletedAt: null } });
  },

  // Roots only — what the issue page's "N comments" heading counts, since
  // replies are shown nested under their root rather than as list entries.
  countTopLevel(issueId: string) {
    return prisma.comment.count({
      where: { issueId, parentCommentId: null, deletedAt: null },
    });
  },

  // A single comment plus the owning issue's projectId — the service needs the
  // project for tenant scope (F-1) and RBAC without a second query.
  findById(id: string) {
    return prisma.comment.findFirst({
      where: { id, deletedAt: null },
      select: { ...commentSelect, issue: { select: { projectId: true } } },
    });
  },

  // Create the comment and its mention index in one transaction — a comment
  // whose mentions did not save would notify nobody and be invisible to
  // "mentions me", silently.
  create(input: {
    issueId: string;
    authorId: string;
    body: string;
    parentCommentId: string | null;
    mentionedUserIds: string[];
  }) {
    return prisma.$transaction(async (tx) => {
      const row = await tx.comment.create({
        data: {
          issueId: input.issueId,
          authorId: input.authorId,
          body: input.body,
          parentCommentId: input.parentCommentId,
          createdBy: input.authorId,
        },
        select: commentSelect,
      });
      if (input.mentionedUserIds.length > 0) {
        await tx.commentMention.createMany({
          data: input.mentionedUserIds.map((userId) => ({
            commentId: row.id,
            userId,
            createdBy: input.authorId,
          })),
          skipDuplicates: true,
        });
      }
      return row;
    });
  },

  /**
   * Which of `userIds` may actually be mentioned by this actor: same
   * organization, active, not deleted.
   *
   * The gate that stops a hand-crafted body from minting a notification to
   * someone in another tenant — the composer offers only visible users, but the
   * composer is not a security boundary.
   */
  async resolveMentionableIds(userIds: string[], organizationId: string): Promise<string[]> {
    if (userIds.length === 0) return [];
    const rows = await prisma.user.findMany({
      where: { id: { in: userIds }, organizationId, isActive: true, deletedAt: null },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  },

  // Users this actor can mention, ranked so project members come first.
  // Not a directory: never leaves the actor's organization.
  async searchMentionable(
    organizationId: string,
    projectId: string,
    query: string,
    take = 8,
  ) {
    const rows = await prisma.user.findMany({
      where: {
        organizationId,
        isActive: true,
        deletedAt: null,
        ...(query ? { name: { contains: query, mode: "insensitive" as const } } : {}),
      },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
        projectMemberships: { where: { projectId }, select: { id: true }, take: 1 },
      },
      orderBy: { name: "asc" },
      // Over-fetch so the project-member sort below has something to reorder;
      // a plain LIMIT would cut members off before they could be promoted.
      take: take * 5,
    });

    return rows
      .map((r) => ({
        id: r.id,
        name: r.name,
        avatarUrl: r.avatarUrl,
        isProjectMember: r.projectMemberships.length > 0,
      }))
      .sort((a, b) => Number(b.isProjectMember) - Number(a.isProjectMember))
      .slice(0, take);
  },

  // Version-checked edit (ADR-0011): applies only if the comment is still at
  // `expectedVersion`; returns the updated row, or null on a lost update.
  async updateWithVersion(
    id: string,
    expectedVersion: number,
    body: string,
    actorId: string,
    mentionedUserIds: string[],
  ) {
    return prisma.$transaction(async (tx) => {
      const result = await tx.comment.updateMany({
        where: { id, version: expectedVersion, deletedAt: null },
        data: { body, editedAt: new Date(), version: { increment: 1 }, updatedBy: actorId },
      });
      if (result.count === 0) return null;

      // The index is derived from the body, so an edit rebuilds it rather than
      // adding to it — removing a name from a comment must remove the mention.
      // Hard delete: these rows are an index over live text, not audited
      // history, so a soft-deleted one would have to be excluded from every
      // read for no benefit.
      await tx.commentMention.deleteMany({
        where: { commentId: id, userId: { notIn: mentionedUserIds } },
      });
      if (mentionedUserIds.length > 0) {
        await tx.commentMention.createMany({
          data: mentionedUserIds.map((userId) => ({ commentId: id, userId, createdBy: actorId })),
          skipDuplicates: true,
        });
      }
      return tx.comment.findFirst({ where: { id }, select: commentSelect });
    });
  },

  // Soft-deletes the comment and, for a root, its replies — a thread whose root
  // vanished would otherwise leave orphans reachable only by direct link.
  // Mentions go too, so a deleted comment stops showing in "mentions me".
  softDelete(id: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const now = new Date();
      const replies = await tx.comment.findMany({
        where: { parentCommentId: id, deletedAt: null },
        select: { id: true },
      });
      const ids = [id, ...replies.map((r) => r.id)];

      await tx.comment.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: now, version: { increment: 1 }, updatedBy: actorId },
      });
      await tx.commentMention.deleteMany({ where: { commentId: { in: ids } } });
      return { id, deletedCount: ids.length };
    });
  },
};

export type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;
