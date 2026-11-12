import { prisma } from "@/shared/lib/db";

// Org-defined activities (ADR-0059 §3.1). Prisma only here.

export interface CatalogueCategory {
  name: string;
  activities: {
    name: string;
    billable?: boolean;
    requiresProject?: boolean;
    requiresClient?: boolean;
    notesRequired?: boolean;
  }[];
}

const activitySelect = {
  id: true,
  organizationId: true,
  categoryId: true,
  name: true,
  billable: true,
  requiresProject: true,
  requiresClient: true,
  notesRequired: true,
  visibleToAllTeams: true,
  archivedAt: true,
  teams: { select: { teamId: true } },
} as const;

export const ActivityRepository = {
  hasCatalogue(organizationId: string) {
    return prisma.activityCategory.count({ where: { organizationId } });
  },

  // Idempotent on the unique names, so two first requests racing cannot
  // produce a doubled catalogue.
  async seedCatalogue(organizationId: string, catalogue: CatalogueCategory[]): Promise<void> {
    await prisma.activityCategory.createMany({
      data: catalogue.map((c, position) => ({ organizationId, name: c.name, position })),
      skipDuplicates: true,
    });
    const categories = await prisma.activityCategory.findMany({
      where: { organizationId, name: { in: catalogue.map((c) => c.name) } },
      select: { id: true, name: true },
    });
    const idByName = new Map(categories.map((c) => [c.name, c.id]));
    await prisma.activity.createMany({
      data: catalogue.flatMap((c) =>
        c.activities.map((a, position) => ({
          organizationId,
          categoryId: idByName.get(c.name)!,
          name: a.name,
          position,
          billable: a.billable ?? null,
          requiresProject: a.requiresProject ?? false,
          requiresClient: a.requiresClient ?? false,
          notesRequired: a.notesRequired ?? false,
        })),
      ),
      skipDuplicates: true,
    });
  },

  findById(id: string) {
    return prisma.activity.findFirst({ where: { id, deletedAt: null }, select: activitySelect });
  },

  // Active activities visible to a team (or to everyone), grouped by the
  // caller. Bounded by the org's catalogue, which is admin-curated.
  visible(input: { organizationId: string; teamId: string | null; q?: string; categoryId?: string }) {
    return prisma.activity.findMany({
      where: {
        organizationId: input.organizationId,
        deletedAt: null,
        archivedAt: null,
        category: { deletedAt: null, archivedAt: null },
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        ...(input.q ? { name: { contains: input.q, mode: "insensitive" as const } } : {}),
        OR: [
          { visibleToAllTeams: true },
          ...(input.teamId ? [{ teams: { some: { teamId: input.teamId } } }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        categoryId: true,
        requiresProject: true,
        requiresClient: true,
        notesRequired: true,
        category: { select: { id: true, name: true, position: true } },
      },
      orderBy: [{ category: { position: "asc" } }, { position: "asc" }, { name: "asc" }],
      take: 500,
    });
  },

  // The caller's most recently used activities, newest first.
  async recentIds(userId: string, take: number): Promise<string[]> {
    const rows = await prisma.workLog.groupBy({
      by: ["activityId"],
      where: { userId, deletedAt: null, activityId: { not: null } },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      take,
    });
    return rows.flatMap((r) => (r.activityId ? [r.activityId] : []));
  },
};
