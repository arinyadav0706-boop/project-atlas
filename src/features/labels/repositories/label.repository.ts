import { prisma } from "@/shared/lib/db";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §4).
// Labels are org-scoped entities; the issue<->label link lives in `issue_labels`.

const labelSelect = {
  id: true,
  name: true,
  color: true,
} as const;

export const LabelRepository = {
  listByOrg(organizationId: string) {
    return prisma.label.findMany({
      where: { organizationId, deletedAt: null },
      select: labelSelect,
      orderBy: [{ name: "asc" }],
    });
  },

  // Scope-checked single lookup (organizationId returned so the service can
  // enforce tenant scope, F-1).
  findById(id: string) {
    return prisma.label.findFirst({
      where: { id, deletedAt: null },
      select: { ...labelSelect, organizationId: true },
    });
  },

  // Case-insensitive name match over live rows — the dedup guard (BR-3). The
  // functional unique index is the race-proof backstop; this drives UX.
  findByNameCI(organizationId: string, name: string) {
    return prisma.label.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        name: { equals: name, mode: "insensitive" },
      },
      select: { ...labelSelect, organizationId: true },
    });
  },

  // Live labels in the org among the given ids — used to validate an assignment
  // set (rejects ids from another org / soft-deleted, F-1).
  listByIds(organizationId: string, ids: string[]) {
    return prisma.label.findMany({
      where: { id: { in: ids }, organizationId, deletedAt: null },
      select: { id: true },
    });
  },

  create(input: { organizationId: string; name: string; color: string; actorId: string }) {
    return prisma.label.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        color: input.color,
        createdBy: input.actorId,
      },
      select: labelSelect,
    });
  },

  update(id: string, data: { name?: string; color?: string; actorId: string }) {
    return prisma.label.update({
      where: { id },
      data: { name: data.name, color: data.color, updatedBy: data.actorId },
      select: labelSelect,
    });
  },

  softDelete(id: string, actorId: string) {
    return prisma.$transaction([
      // Detach from issues so it leaves filters/chips immediately; the label row
      // is soft-deleted, its history on issues is otherwise dropped by design
      // (a future merge tool would reconcile — ADR-0018).
      prisma.issueLabel.deleteMany({ where: { labelId: id } }),
      prisma.label.update({
        where: { id },
        data: { deletedAt: new Date(), updatedBy: actorId },
        select: { id: true },
      }),
    ]);
  },

  // The labels currently on an issue (for chips/detail).
  listForIssue(issueId: string) {
    return prisma.label
      .findMany({
        where: { deletedAt: null, issues: { some: { issueId } } },
        select: labelSelect,
        orderBy: [{ name: "asc" }],
      });
  },

  // Idempotent replace of an issue's label set (BR-1). One transaction: drop the
  // removed links, add the new ones; existing links are left untouched.
  setForIssue(issueId: string, labelIds: string[], actorId: string) {
    return prisma.$transaction([
      prisma.issueLabel.deleteMany({
        where: { issueId, labelId: { notIn: labelIds.length ? labelIds : [""] } },
      }),
      prisma.issueLabel.createMany({
        data: labelIds.map((labelId) => ({ issueId, labelId, createdBy: actorId })),
        skipDuplicates: true,
      }),
    ]);
  },
};
