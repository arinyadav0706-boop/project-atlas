import type { Prisma, StatusCategory } from "@prisma/client";
import { prisma } from "@/shared/lib/db";
import { DEFAULT_STATUSES } from "@/features/workflow/lib/defaults";

// Workflow statuses and transitions (ADR-0049). Prisma lives only in
// `*.repository.ts` (Feature Architecture §4).

const statusSelect = {
  id: true,
  name: true,
  category: true,
  color: true,
  position: true,
  isDefault: true,
} as const;

/** A transaction client or the root client — seeding runs inside project creation. */
type Db = Prisma.TransactionClient | typeof prisma;

export const WorkflowRepository = {
  /**
   * The four statuses a new project starts with (BR-7).
   *
   * Takes a transaction client because it runs inside project creation: a
   * project that exists without statuses cannot hold an issue, so the two must
   * commit together or not at all.
   */
  seedDefaults(db: Db, projectId: string, organizationId: string, actorId: string | null) {
    return db.workflowStatus.createMany({
      data: DEFAULT_STATUSES.map((s) => ({
        organizationId,
        projectId,
        name: s.name,
        category: s.category,
        color: s.color,
        position: s.position,
        isDefault: s.isDefault,
        createdBy: actorId,
        updatedBy: actorId,
      })),
    });
  },

  list(projectId: string) {
    return prisma.workflowStatus.findMany({
      where: { projectId, deletedAt: null },
      select: statusSelect,
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
  },

  /** The same list, plus how many live issues sit on each — the editor needs it. */
  async listWithCounts(projectId: string) {
    const [statuses, counts] = await Promise.all([
      this.list(projectId),
      prisma.issue.groupBy({
        by: ["statusId"],
        where: { projectId, deletedAt: null },
        _count: { _all: true },
      }),
    ]);
    const byId = new Map(counts.map((c) => [c.statusId, c._count._all]));
    return statuses.map((s) => ({ ...s, issueCount: byId.get(s.id) ?? 0 }));
  },

  findById(id: string) {
    return prisma.workflowStatus.findFirst({
      where: { id, deletedAt: null },
      select: { ...statusSelect, projectId: true, organizationId: true },
    });
  },

  /** The status new issues get (BR-5). */
  findDefault(db: Db, projectId: string) {
    return db.workflowStatus.findFirst({
      where: { projectId, deletedAt: null, isDefault: true },
      select: statusSelect,
    });
  },

  findByName(projectId: string, name: string) {
    return prisma.workflowStatus.findFirst({
      // Case-insensitive: "Done" and "done" on one board is a data-entry bug,
      // not a choice (BR-4).
      where: { projectId, deletedAt: null, name: { equals: name, mode: "insensitive" } },
      select: { id: true, name: true },
    });
  },

  async nextPosition(projectId: string) {
    const last = await prisma.workflowStatus.findFirst({
      where: { projectId, deletedAt: null },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    return (last?.position ?? -1) + 1;
  },

  create(data: {
    organizationId: string;
    projectId: string;
    name: string;
    category: StatusCategory;
    color: string;
    position: number;
    actorId: string;
  }) {
    const { actorId, ...fields } = data;
    return prisma.workflowStatus.create({
      data: { ...fields, createdBy: actorId, updatedBy: actorId },
      select: statusSelect,
    });
  },

  /**
   * Update one status, and when the category changes bring its issues' cached
   * category with it — the invariant in BR-2 is not optional just because the
   * change came from the status side.
   */
  update(
    id: string,
    data: { name?: string; color?: string; category?: StatusCategory },
    actorId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const status = await tx.workflowStatus.update({
        where: { id },
        data: { ...data, updatedBy: actorId },
        select: { ...statusSelect, projectId: true },
      });
      if (data.category) {
        await tx.issue.updateMany({
          where: { statusId: id, deletedAt: null },
          data: { status: data.category, updatedBy: actorId },
        });
      }
      return status;
    });
  },

  /** Exactly one default per project, moved in one transaction (BR-5). */
  setDefault(projectId: string, id: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.workflowStatus.updateMany({
        where: { projectId, isDefault: true },
        data: { isDefault: false, updatedBy: actorId },
      });
      return tx.workflowStatus.update({
        where: { id },
        data: { isDefault: true, updatedBy: actorId },
        select: statusSelect,
      });
    });
  },

  /**
   * Whole-list reorder (BR-8): the client sends every id, the server rewrites
   * every position. Sending one moved id invites two clients to interleave into
   * an order neither of them chose.
   */
  reorder(projectId: string, orderedIds: string[], actorId: string) {
    return prisma.$transaction(
      orderedIds.map((id, position) =>
        prisma.workflowStatus.updateMany({
          where: { id, projectId },
          data: { position, updatedBy: actorId },
        }),
      ),
    );
  },

  /**
   * Soft-delete a status, moving every issue on it to `replacementId` first
   * (BR-6). One transaction: an issue pointing at a deleted status is a row the
   * board cannot draw.
   */
  deleteWithReassign(
    id: string,
    replacementId: string,
    replacementCategory: StatusCategory,
    actorId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const moved = await tx.issue.updateMany({
        where: { statusId: id, deletedAt: null },
        data: { statusId: replacementId, status: replacementCategory, updatedBy: actorId },
      });
      // A transition pointing at a status nobody can reach is dead weight, and
      // it would resurrect if the name were ever reused (BR-12).
      await tx.statusTransition.deleteMany({
        where: { OR: [{ fromStatusId: id }, { toStatusId: id }] },
      });
      await tx.workflowStatus.update({
        where: { id },
        data: { deletedAt: new Date(), isDefault: false, updatedBy: actorId },
      });
      return moved.count;
    });
  },

  listTransitions(projectId: string) {
    return prisma.statusTransition.findMany({
      where: { projectId },
      select: { id: true, fromStatusId: true, toStatusId: true },
    });
  },

  /** Replace the whole allowed set, and the enforcement flag, together. */
  replaceTransitions(
    projectId: string,
    enforce: boolean,
    pairs: { fromStatusId: string; toStatusId: string }[],
    actorId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.statusTransition.deleteMany({ where: { projectId } });
      if (pairs.length > 0) {
        await tx.statusTransition.createMany({
          data: pairs.map((p) => ({ ...p, projectId, createdBy: actorId })),
        });
      }
      await tx.project.update({
        where: { id: projectId },
        data: { enforceTransitions: enforce, updatedBy: actorId },
      });
    });
  },

  isTransitionAllowed(fromStatusId: string, toStatusId: string) {
    return prisma.statusTransition.findFirst({
      where: { fromStatusId, toStatusId },
      select: { id: true },
    });
  },

  /** Where an issue on this status may go — the refusal message needs it. */
  reachableFrom(fromStatusId: string) {
    return prisma.statusTransition.findMany({
      where: { fromStatusId },
      select: { toStatus: { select: { id: true, name: true } } },
    });
  },
};
