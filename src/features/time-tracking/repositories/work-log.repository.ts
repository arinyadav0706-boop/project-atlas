import { prisma } from "@/shared/lib/db";
import type { Prisma } from "@prisma/client";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §4).
// RBAC + audit live in the service; this is the data access seam.

const userSelect = { select: { id: true, name: true, avatarUrl: true } } as const;

const workLogSelect = {
  id: true,
  issueId: true,
  userId: true,
  minutes: true,
  workDate: true,
  note: true,
  version: true,
  createdAt: true,
  user: userSelect,
} as const;

export const DEFAULT_WORKLOG_PAGE_SIZE = 50;
export const MAX_WORKLOG_PAGE_SIZE = 100;

export const WorkLogRepository = {
  // One page of an issue's logs, NEWEST-first, keyset-paginated (Performance
  // standard #1 — never an unbounded list). Fetches take+1 to detect a next page.
  listByIssue(issueId: string, page: { cursor?: string; take?: number } = {}) {
    const take = Math.min(page.take ?? DEFAULT_WORKLOG_PAGE_SIZE, MAX_WORKLOG_PAGE_SIZE);
    return prisma.workLog.findMany({
      where: { issueId, deletedAt: null },
      select: workLogSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(page.cursor ? { cursor: { id: page.cursor }, skip: 1 } : {}),
    });
  },

  // Σ logged minutes for an issue (non-deleted). DB-side aggregate — O(1) rows.
  async sumMinutesByIssue(issueId: string): Promise<number> {
    const agg = await prisma.workLog.aggregate({
      _sum: { minutes: true },
      where: { issueId, deletedAt: null },
    });
    return agg._sum.minutes ?? 0;
  },

  // A single log plus its issue's projectId — the service needs the project for
  // F-1 tenant scope and RBAC without a second query.
  findById(id: string) {
    return prisma.workLog.findFirst({
      where: { id, deletedAt: null },
      select: { ...workLogSelect, issue: { select: { projectId: true } } },
    });
  },

  create(input: {
    issueId: string;
    userId: string;
    minutes: number;
    workDate: Date;
    note: string | null;
  }) {
    return prisma.workLog.create({
      data: {
        issueId: input.issueId,
        userId: input.userId,
        minutes: input.minutes,
        workDate: input.workDate,
        note: input.note,
        createdBy: input.userId,
      },
      select: workLogSelect,
    });
  },

  // Version-checked edit (ADR-0011): applies only if still at expectedVersion;
  // returns the updated row, or null on a lost update.
  async updateWithVersion(
    id: string,
    expectedVersion: number,
    data: { minutes: number; workDate: Date; note: string | null },
    actorId: string,
  ) {
    const result = await prisma.workLog.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...data, version: { increment: 1 }, updatedBy: actorId },
    });
    if (result.count === 0) return null;
    return prisma.workLog.findFirst({ where: { id }, select: workLogSelect });
  },

  softDelete(id: string, actorId: string) {
    return prisma.workLog.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 }, updatedBy: actorId },
      select: { id: true },
    });
  },
};

export type WorkLogRow = Prisma.WorkLogGetPayload<{ select: typeof workLogSelect }>;
