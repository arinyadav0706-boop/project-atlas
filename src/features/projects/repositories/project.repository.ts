import { prisma } from "@/shared/lib/db";
import type { ProjectRole, ProjectStatus } from "@prisma/client";
import { WorkflowRepository } from "@/features/workflow/repositories/workflow.repository";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §2).
export const ProjectRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      select: { id: true, isActive: true, deletedAt: true },
    });
  },

  listActiveWithMembership(organizationId: string, userId: string) {
    return prisma.project.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        members: {
          where: { userId, deletedAt: null },
          select: { role: true },
        },
      },
    });
  },

  findById(id: string) {
    return prisma.project.findFirst({ where: { id, deletedAt: null } });
  },

  findByKey(organizationId: string, key: string) {
    return prisma.project.findFirst({
      where: { organizationId, key, deletedAt: null },
    });
  },

  // Creator becomes LEAD atomically with project creation
  // (03_projects.md BR-1).
  createWithLead(input: {
    organizationId: string;
    key: string;
    name: string;
    description: string | null;
    creatorId: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          organizationId: input.organizationId,
          key: input.key,
          name: input.name,
          description: input.description,
          createdBy: input.creatorId,
        },
      });
      await tx.projectMember.create({
        data: {
          projectId: project.id,
          userId: input.creatorId,
          role: "LEAD",
          createdBy: input.creatorId,
        },
      });
      // In the SAME transaction (30_workflow BR-7): a project without statuses
      // cannot hold an issue, since `Issue.statusId` is required. Seeding it
      // afterwards would leave a window where creating an issue fails.
      await WorkflowRepository.seedDefaults(
        tx,
        project.id,
        input.organizationId,
        input.creatorId,
      );
      return project;
    });
  },

  update(
    id: string,
    data: { name?: string; description?: string | null; status?: ProjectStatus },
    actorId: string,
  ) {
    return prisma.project.update({
      where: { id },
      data: { ...data, updatedBy: actorId },
    });
  },

  softDelete(id: string, actorId: string) {
    return prisma.project.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorId },
    });
  },

  listMembers(projectId: string) {
    return prisma.projectMember.findMany({
      where: { projectId, deletedAt: null },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });
  },

  findMember(projectId: string, userId: string) {
    return prisma.projectMember.findFirst({
      where: { projectId, userId, deletedAt: null },
    });
  },

  findMemberById(memberId: string) {
    return prisma.projectMember.findFirst({
      where: { id: memberId, deletedAt: null },
    });
  },

  // Includes soft-deleted rows: the (projectId, userId) unique constraint
  // spans them, so re-adding a removed member must restore the old row
  // rather than inserting a new one.
  findMemberIncludingRemoved(projectId: string, userId: string) {
    return prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
  },

  addMember(projectId: string, userId: string, role: ProjectRole, actorId: string) {
    return prisma.projectMember.create({
      data: { projectId, userId, role, createdBy: actorId },
    });
  },

  restoreMember(memberId: string, role: ProjectRole, actorId: string) {
    return prisma.projectMember.update({
      where: { id: memberId },
      data: { deletedAt: null, role, updatedBy: actorId },
    });
  },

  updateMemberRole(memberId: string, role: ProjectRole, actorId: string) {
    return prisma.projectMember.update({
      where: { id: memberId },
      data: { role, updatedBy: actorId },
    });
  },

  removeMember(memberId: string, actorId: string) {
    return prisma.projectMember.update({
      where: { id: memberId },
      data: { deletedAt: new Date(), updatedBy: actorId },
    });
  },

  countLeads(projectId: string) {
    return prisma.projectMember.count({
      where: { projectId, role: "LEAD", deletedAt: null },
    });
  },

  // Whether the user is LEAD of any live project in their org — the
  // "trusted curator" signal for managing org-wide labels (ADR-0018 BR-2).
  countLeadMemberships(userId: string, organizationId: string) {
    return prisma.projectMember.count({
      where: {
        userId,
        role: "LEAD",
        deletedAt: null,
        project: { organizationId, deletedAt: null },
      },
    });
  },
};
