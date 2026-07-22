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

export const CommentRepository = {
  // One page of an issue's comments, oldest-first. Fetches `take + 1` so the
  // service can detect a further page.
  listByIssue(issueId: string, page: { cursor?: string; take?: number } = {}) {
    const take = Math.min(page.take ?? DEFAULT_COMMENT_PAGE_SIZE, MAX_COMMENT_PAGE_SIZE);
    return prisma.comment.findMany({
      where: { issueId, deletedAt: null },
      select: commentSelect,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: take + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
  },

  countByIssue(issueId: string) {
    return prisma.comment.count({ where: { issueId, deletedAt: null } });
  },

  // A single comment plus the owning issue's projectId — the service needs the
  // project for tenant scope (F-1) and RBAC without a second query.
  findById(id: string) {
    return prisma.comment.findFirst({
      where: { id, deletedAt: null },
      select: { ...commentSelect, issue: { select: { projectId: true } } },
    });
  },

  create(input: {
    issueId: string;
    authorId: string;
    body: string;
    parentCommentId: string | null;
  }) {
    return prisma.comment.create({
      data: {
        issueId: input.issueId,
        authorId: input.authorId,
        body: input.body,
        parentCommentId: input.parentCommentId,
        createdBy: input.authorId,
      },
      select: commentSelect,
    });
  },

  // Version-checked edit (ADR-0011): applies only if the comment is still at
  // `expectedVersion`; returns the updated row, or null on a lost update.
  async updateWithVersion(
    id: string,
    expectedVersion: number,
    body: string,
    actorId: string,
  ) {
    const result = await prisma.comment.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { body, editedAt: new Date(), version: { increment: 1 }, updatedBy: actorId },
    });
    if (result.count === 0) return null;
    return prisma.comment.findFirst({ where: { id }, select: commentSelect });
  },

  softDelete(id: string, actorId: string) {
    return prisma.comment.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 }, updatedBy: actorId },
      select: { id: true },
    });
  },
};

export type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;
