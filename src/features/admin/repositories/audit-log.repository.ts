import { prisma } from "@/shared/lib/db";
import type { Prisma } from "@prisma/client";

// Public input type is plain-JSON, not Prisma.InputJsonValue — the caller
// (AuditLogService) has no reason to depend on a Prisma type. The cast to
// Prisma's JSON type happens here, at the one place allowed to know about
// Prisma (Feature Architecture §2).
export interface AuditLogListFilters {
  organizationId: string;
  action?: string;
  entityType?: string;
  from?: Date;
  to?: Date;
  skip: number;
  take: number;
}

export const AuditLogRepository = {
  create(input: {
    organizationId: string;
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    beforeData?: Record<string, unknown>;
    afterData?: Record<string, unknown>;
  }) {
    return prisma.auditLog.create({
      data: {
        ...input,
        beforeData: input.beforeData as Prisma.InputJsonValue | undefined,
        afterData: input.afterData as Prisma.InputJsonValue | undefined,
      },
    });
  },

  // Filterable, paginated read (13_admin.md BR-2 read path). Org-scoped (F-1),
  // newest first, served by the (organizationId, createdAt) index. Returns the
  // page plus the total so the viewer can render pagination without loading all.
  async list(filters: AuditLogListFilters) {
    const where: Prisma.AuditLogWhereInput = {
      organizationId: filters.organizationId,
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.entityType ? { entityType: filters.entityType } : {}),
      ...(filters.from || filters.to
        ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: filters.skip,
        take: filters.take,
      }),
      prisma.auditLog.count({ where }),
    ]);
    return { rows, total };
  },
};
