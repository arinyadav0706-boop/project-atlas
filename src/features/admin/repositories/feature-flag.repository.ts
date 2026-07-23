import { prisma } from "@/shared/lib/db";

// Only override rows live here — the catalog is code (ADR-0023 §1). Prisma is
// imported ONLY in *.repository.ts files (Feature Architecture §2).
export const FeatureFlagRepository = {
  // All explicit overrides for one org (F-1), keyed by flag for O(1) lookup by
  // the service when it resolves override ?? default.
  listOverrides(organizationId: string) {
    return prisma.featureFlag.findMany({
      where: { organizationId },
      select: { key: true, enabled: true, updatedAt: true },
    });
  },

  findOverride(organizationId: string, key: string) {
    return prisma.featureFlag.findUnique({
      where: { organizationId_key: { organizationId, key } },
      select: { key: true, enabled: true, updatedAt: true },
    });
  },

  upsertOverride(input: {
    organizationId: string;
    key: string;
    enabled: boolean;
    actorId: string;
  }) {
    return prisma.featureFlag.upsert({
      where: {
        organizationId_key: { organizationId: input.organizationId, key: input.key },
      },
      create: {
        organizationId: input.organizationId,
        key: input.key,
        enabled: input.enabled,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
      update: { enabled: input.enabled, updatedBy: input.actorId },
      select: { key: true, enabled: true, updatedAt: true },
    });
  },

  // Reset-to-default hard-deletes the override row (Database Design §2.16); the
  // change itself is recorded in AuditLog by the service.
  deleteOverride(organizationId: string, key: string) {
    return prisma.featureFlag.deleteMany({ where: { organizationId, key } });
  },
};
