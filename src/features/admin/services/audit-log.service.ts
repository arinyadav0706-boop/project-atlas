import { AuditLogRepository } from "@/features/admin/repositories/audit-log.repository";

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
};
