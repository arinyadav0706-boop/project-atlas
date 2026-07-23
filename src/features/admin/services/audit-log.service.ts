import type { Actor } from "@/shared/types/actor";
import { AdminCapability, requireCapability } from "@/features/admin/authz/capabilities";
import { AuditLogRepository } from "@/features/admin/repositories/audit-log.repository";
import type { AuditLogPageDto } from "@/features/admin/types/admin.types";
import type { AuditLogQuery } from "@/features/admin/validation/admin.schemas";

type JsonRecord = Record<string, unknown>;

// Other features depend on this service, never on AuditLogRepository
// directly (Feature Architecture §4 — cross-feature calls go through a
// service, not another feature's repository). The Prisma-specific JSON
// type stays inside the repository (Feature Architecture §2 — Prisma
// imported only in *.repository.ts files); this service's public shape is
// a plain JSON-compatible type.
export const AuditLogService = {
  record(input: {
    organizationId: string;
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    beforeData?: JsonRecord;
    afterData?: JsonRecord;
  }) {
    return AuditLogRepository.create(input);
  },

  // The read path (13_admin.md BR-2, VIEW_AUDIT_LOG). Org-scoped (F-1),
  // filterable, paginated — never loads the whole trail at once.
  async list(actor: Actor, query: AuditLogQuery): Promise<AuditLogPageDto> {
    requireCapability(actor, AdminCapability.VIEW_AUDIT_LOG);

    const { rows, total } = await AuditLogRepository.list({
      organizationId: actor.organizationId,
      action: query.action,
      entityType: query.entityType,
      from: query.from,
      to: query.to,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });

    return {
      data: rows.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        beforeData: (row.beforeData as JsonRecord | null) ?? null,
        afterData: (row.afterData as JsonRecord | null) ?? null,
        createdAt: row.createdAt.toISOString(),
      })),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  },
};
