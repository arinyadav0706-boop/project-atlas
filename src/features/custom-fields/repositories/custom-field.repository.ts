import type { Prisma } from "@prisma/client";
import { prisma } from "@/shared/lib/db";
import type { StorableValue } from "@/features/custom-fields/lib/coerce-value";

// Custom fields (ADR-0042). Prisma lives only in `*.repository.ts`
// (Feature Architecture §4).

const optionSelect = {
  id: true,
  label: true,
  position: true,
} as const;

const definitionSelect = {
  id: true,
  name: true,
  type: true,
  description: true,
  required: true,
  options: {
    where: { deletedAt: null },
    select: optionSelect,
    orderBy: { position: "asc" },
  },
  _count: { select: { projects: true } },
} as const;

export const CustomFieldRepository = {
  // ── Definitions ──────────────────────────────────────────────────────────

  listDefinitions(organizationId: string) {
    return prisma.customFieldDefinition.findMany({
      where: { organizationId, deletedAt: null },
      select: definitionSelect,
      orderBy: { name: "asc" },
    });
  },

  findDefinition(id: string, organizationId: string) {
    return prisma.customFieldDefinition.findFirst({
      where: { id, organizationId, deletedAt: null },
      select: definitionSelect,
    });
  },

  /** Case-insensitive duplicate check (BR-1), excluding the row being edited. */
  findByName(organizationId: string, name: string, exceptId?: string) {
    return prisma.customFieldDefinition.findFirst({
      where: {
        organizationId,
        deletedAt: null,
        name: { equals: name, mode: "insensitive" },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
  },

  createDefinition(data: {
    organizationId: string;
    name: string;
    type: string;
    description: string | null;
    required: boolean;
    options: { label: string }[];
    actorId: string;
  }) {
    return prisma.customFieldDefinition.create({
      data: {
        organizationId: data.organizationId,
        name: data.name,
        type: data.type as Prisma.CustomFieldDefinitionCreateInput["type"],
        description: data.description,
        required: data.required,
        createdBy: data.actorId,
        updatedBy: data.actorId,
        options: {
          create: data.options.map((o, i) => ({ label: o.label, position: i })),
        },
      },
      select: definitionSelect,
    });
  },

  /**
   * Update the definition and reconcile its options in one transaction.
   *
   * Options with an id are updated in place, so a rename keeps every value
   * pointing at them; options absent from the payload are soft-deleted, not
   * removed, so historical values still resolve to a label (ADR-0042 §5).
   */
  updateDefinition(
    id: string,
    data: {
      name?: string;
      description?: string | null;
      required?: boolean;
      options?: { id?: string; label: string }[];
      actorId: string;
    },
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.customFieldDefinition.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.required !== undefined ? { required: data.required } : {}),
          updatedBy: data.actorId,
        },
      });

      if (data.options) {
        const keep = new Set(data.options.filter((o) => o.id).map((o) => o.id!));
        await tx.customFieldOption.updateMany({
          where: { fieldId: id, deletedAt: null, id: { notIn: [...keep] } },
          data: { deletedAt: new Date() },
        });
        for (const [i, option] of data.options.entries()) {
          if (option.id) {
            await tx.customFieldOption.update({
              where: { id: option.id },
              data: { label: option.label, position: i },
            });
          } else {
            await tx.customFieldOption.create({
              data: { fieldId: id, label: option.label, position: i },
            });
          }
        }
      }

      return tx.customFieldDefinition.findFirstOrThrow({
        where: { id },
        select: definitionSelect,
      });
    });
  },

  /**
   * Soft delete, and detach from every project.
   *
   * Value rows are deliberately left alone (BR-12) — they are history. The
   * project links go because a disabled definition must not keep occupying a
   * project's field budget.
   */
  softDeleteDefinition(id: string, actorId: string) {
    return prisma.$transaction([
      prisma.projectCustomField.deleteMany({ where: { fieldId: id } }),
      prisma.customFieldDefinition.update({
        where: { id },
        data: { deletedAt: new Date(), updatedBy: actorId },
        select: { id: true },
      }),
    ]);
  },

  // ── Per-project enablement ───────────────────────────────────────────────

  listForProject(projectId: string) {
    return prisma.projectCustomField.findMany({
      where: { projectId, field: { deletedAt: null } },
      select: { position: true, field: { select: definitionSelect } },
      orderBy: { position: "asc" },
    });
  },

  /** Replace the whole set atomically — the order IS the payload's order. */
  setForProject(projectId: string, fieldIds: string[]) {
    return prisma.$transaction([
      prisma.projectCustomField.deleteMany({ where: { projectId } }),
      prisma.projectCustomField.createMany({
        data: fieldIds.map((fieldId, i) => ({ projectId, fieldId, position: i })),
      }),
    ]);
  },

  // ── Values ───────────────────────────────────────────────────────────────

  valuesForIssue(issueId: string) {
    return prisma.customFieldValue.findMany({
      where: { issueId },
      select: {
        fieldId: true,
        valueText: true,
        valueNumber: true,
        valueDate: true,
        valueBool: true,
        valueUserId: true,
        optionIds: true,
      },
    });
  },

  usersByIds(ids: string[]) {
    return prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, avatarUrl: true },
    });
  },

  /**
   * Apply a batch of value writes for one issue, atomically.
   *
   * `@@unique([issueId, fieldId])` makes each write an upsert rather than a
   * check-then-insert, so two people saving different fields on the same issue
   * cannot race into a duplicate row.
   */
  applyValues(
    issueId: string,
    sets: { fieldId: string; value: StorableValue }[],
    clears: string[],
    actorId: string,
  ) {
    return prisma.$transaction([
      ...(clears.length
        ? [prisma.customFieldValue.deleteMany({ where: { issueId, fieldId: { in: clears } } })]
        : []),
      ...sets.map((s) =>
        prisma.customFieldValue.upsert({
          where: { issueId_fieldId: { issueId, fieldId: s.fieldId } },
          create: {
            issueId,
            fieldId: s.fieldId,
            ...s.value,
            createdBy: actorId,
            updatedBy: actorId,
          },
          update: { ...s.value, updatedBy: actorId },
        }),
      ),
    ]);
  },
};
