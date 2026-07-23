import { prisma } from "@/shared/lib/db";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §4).
// Components are project-scoped; the issue<->component link lives in
// `issue_components`.

const leadSelect = {
  select: { id: true, name: true, avatarUrl: true },
} as const;

const componentSelect = {
  id: true,
  projectId: true,
  name: true,
  description: true,
  lead: leadSelect,
} as const;

export const ComponentRepository = {
  listByProject(projectId: string) {
    return prisma.component.findMany({
      where: { projectId, deletedAt: null },
      select: componentSelect,
      orderBy: [{ name: "asc" }],
    });
  },

  // Single lookup with the owning project's org (for tenant scope, F-1) and
  // projectId (for LEAD RBAC and assignment validation).
  findById(id: string) {
    return prisma.component.findFirst({
      where: { id, deletedAt: null },
      select: { ...componentSelect, project: { select: { organizationId: true } } },
    });
  },

  // Case-insensitive name match over live rows in the project — the dedup guard.
  findByNameCI(projectId: string, name: string) {
    return prisma.component.findFirst({
      where: {
        projectId,
        deletedAt: null,
        name: { equals: name, mode: "insensitive" },
      },
      select: { id: true, name: true },
    });
  },

  // Live components in the project among the given ids, with their leadId —
  // validates an assignment set and drives default-assignee routing (BR-3).
  listByIds(projectId: string, ids: string[]) {
    return prisma.component.findMany({
      where: { id: { in: ids }, projectId, deletedAt: null },
      select: { id: true, leadId: true },
    });
  },

  create(input: {
    projectId: string;
    name: string;
    description: string | null;
    leadId: string | null;
    actorId: string;
  }) {
    return prisma.component.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        description: input.description,
        leadId: input.leadId,
        createdBy: input.actorId,
      },
      select: componentSelect,
    });
  },

  update(
    id: string,
    data: { name?: string; description?: string | null; leadId?: string | null; actorId: string },
  ) {
    return prisma.component.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        leadId: data.leadId,
        updatedBy: data.actorId,
      },
      select: componentSelect,
    });
  },

  softDelete(id: string, actorId: string) {
    return prisma.$transaction([
      prisma.issueComponent.deleteMany({ where: { componentId: id } }),
      prisma.component.update({
        where: { id },
        data: { deletedAt: new Date(), updatedBy: actorId },
        select: { id: true },
      }),
    ]);
  },

  // Component ids currently on an issue (to compute what's newly added).
  async listIdsForIssue(issueId: string): Promise<string[]> {
    const rows = await prisma.issueComponent.findMany({
      where: { issueId },
      select: { componentId: true },
    });
    return rows.map((r) => r.componentId);
  },

  listForIssue(issueId: string) {
    return prisma.component.findMany({
      where: { deletedAt: null, issues: { some: { issueId } } },
      select: componentSelect,
      orderBy: [{ name: "asc" }],
    });
  },

  // Idempotent replace of an issue's component set (BR-2).
  setForIssue(issueId: string, componentIds: string[], actorId: string) {
    return prisma.$transaction([
      prisma.issueComponent.deleteMany({
        where: { issueId, componentId: { notIn: componentIds.length ? componentIds : [""] } },
      }),
      prisma.issueComponent.createMany({
        data: componentIds.map((componentId) => ({ issueId, componentId, createdBy: actorId })),
        skipDuplicates: true,
      }),
    ]);
  },
};
