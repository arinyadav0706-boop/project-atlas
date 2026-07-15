import { prisma } from "@/shared/lib/db";
import type { Prisma, IssueStatus, IssueType } from "@prisma/client";

// Prisma is imported ONLY in *.repository.ts files. Key generation reads
// and increments the owning Project row in the same transaction, so keys
// are unique and never reused (docs/02_Modules/04_issues.md BR-1).

const assigneeSelect = {
  select: { id: true, name: true, avatarUrl: true },
} as const;

const listSelect = {
  id: true,
  key: true,
  type: true,
  title: true,
  status: true,
  priority: true,
  storyPoints: true,
  updatedAt: true,
  assignee: assigneeSelect,
} as const;

export const IssueRepository = {
  listByProject(
    projectId: string,
    filters: { status?: IssueStatus; assigneeId?: string; type?: IssueType },
  ) {
    return prisma.issue.findMany({
      where: {
        projectId,
        deletedAt: null,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
      },
      select: listSelect,
      orderBy: [{ status: "asc" }, { boardOrder: "asc" }, { createdAt: "desc" }],
    });
  },

  findDetail(id: string) {
    return prisma.issue.findFirst({
      where: { id, deletedAt: null },
      include: {
        assignee: assigneeSelect,
        reporter: assigneeSelect,
      },
    });
  },

  findEpic(projectId: string, epicId: string) {
    return prisma.issue.findFirst({
      where: { id: epicId, projectId, type: "EPIC", deletedAt: null },
      select: { id: true },
    });
  },

  async createWithKey(input: {
    projectId: string;
    type: IssueType;
    title: string;
    description: string | null;
    priority: Prisma.IssueCreateInput["priority"];
    assigneeId: string | null;
    reporterId: string;
    epicId: string | null;
    storyPoints: number | null;
    dueDate: Date | null;
    creatorId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id: input.projectId },
        data: { issueKeyCounter: { increment: 1 } },
        select: { key: true, issueKeyCounter: true },
      });
      const key = `${project.key}-${project.issueKeyCounter}`;
      return tx.issue.create({
        data: {
          projectId: input.projectId,
          key,
          type: input.type,
          title: input.title,
          description: input.description,
          priority: input.priority,
          assigneeId: input.assigneeId,
          reporterId: input.reporterId,
          epicId: input.epicId,
          storyPoints: input.storyPoints,
          dueDate: input.dueDate,
          // Append to the end of its (new) status column; the Board module
          // owns fine-grained fractional re-ranking.
          boardOrder: Date.now(),
          createdBy: input.creatorId,
        },
        include: { assignee: assigneeSelect, reporter: assigneeSelect },
      });
    });
  },

  update(
    id: string,
    data: Prisma.IssueUpdateInput,
    actorId: string,
  ) {
    return prisma.issue.update({
      where: { id },
      data: { ...data, updatedBy: actorId },
      include: { assignee: assigneeSelect, reporter: assigneeSelect },
    });
  },

  setStatus(id: string, status: IssueStatus, actorId: string) {
    return prisma.issue.update({
      where: { id },
      data: { status, updatedBy: actorId },
      include: { assignee: assigneeSelect, reporter: assigneeSelect },
    });
  },

  softDelete(id: string, actorId: string) {
    return prisma.issue.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorId },
    });
  },
};
