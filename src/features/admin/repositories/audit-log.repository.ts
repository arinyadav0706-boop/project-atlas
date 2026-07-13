import { prisma } from "@/shared/lib/db";
import type { Prisma } from "@prisma/client";

// Public input type is plain-JSON, not Prisma.InputJsonValue — the caller
// (AuditLogService) has no reason to depend on a Prisma type. The cast to
// Prisma's JSON type happens here, at the one place allowed to know about
// Prisma (Feature Architecture §2).
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
};
