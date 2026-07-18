import { ProjectRepository } from "@/features/projects/repositories/project.repository";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type {
  ProjectDto,
  ProjectMemberDto,
  ProjectRoleDto,
} from "@/features/projects/types/project.types";
import type {
  AddProjectMemberInput,
  CreateProjectInput,
  UpdateProjectInput,
  UpdateProjectMemberInput,
} from "@/features/projects/validation/project.schemas";

// Business rules from docs/02_Modules/03_projects.md. RBAC is enforced
// here, server-side, per project role — org ADMIN carries no implicit
// project powers (founder decision, 15_roles.md).

type ProjectRecord = NonNullable<
  Awaited<ReturnType<typeof ProjectRepository.findById>>
>;

function toDto(project: ProjectRecord, myRole: ProjectRoleDto | null): ProjectDto {
  return {
    id: project.id,
    key: project.key,
    name: project.name,
    description: project.description,
    status: project.status,
    createdAt: project.createdAt.toISOString(),
    myRole,
  };
}

// Tenant scope (F-1): a project outside the caller's org is treated as absent
// — never reveal existence or content across organizations.
async function requireProject(projectId: string, actor: Actor) {
  const project = await ProjectRepository.findById(projectId);
  if (!project || project.organizationId !== actor.organizationId) {
    throw new NotFoundError("Project not found.");
  }
  return project;
}

async function requireLead(projectId: string, actor: Actor) {
  const membership = await ProjectRepository.findMember(projectId, actor.userId);
  if (membership?.role !== "LEAD") {
    throw new ForbiddenError("Only a project LEAD can perform this action.");
  }
}

export interface ProjectContext {
  id: string;
  organizationId: string;
  key: string;
  name: string;
  status: "ACTIVE" | "ARCHIVED";
}

export const ProjectService = {
  // --- Cross-feature seam (other features depend on these, never on
  // ProjectRepository directly — Feature Architecture §4). ---

  // Non-deleted project context for a sibling feature (e.g. Issues) to
  // check existence, archived state, and org scope. Returns null if absent.
  async getContext(projectId: string): Promise<ProjectContext | null> {
    const project = await ProjectRepository.findById(projectId);
    if (!project) return null;
    return {
      id: project.id,
      organizationId: project.organizationId,
      key: project.key,
      name: project.name,
      status: project.status,
    };
  },

  // The user's role in a project, or null if not a member. Used by sibling
  // features for RBAC and for validating assignee membership.
  async getMemberRole(
    projectId: string,
    userId: string,
  ): Promise<ProjectRoleDto | null> {
    const membership = await ProjectRepository.findMember(projectId, userId);
    return membership?.role ?? null;
  },

  // BR-7: all authenticated employees can view all non-deleted projects;
  // membership governs edit rights, not visibility.
  async list(actor: Actor): Promise<ProjectDto[]> {
    const organizationId = actor.organizationId;
    const projects = await ProjectRepository.listActiveWithMembership(
      organizationId,
      actor.userId,
    );
    return projects.map((project) =>
      toDto(project, project.members[0]?.role ?? null),
    );
  },

  // BR-1: creator becomes LEAD. BR-2: key immutable, unique per org.
  async create(actor: Actor, input: CreateProjectInput): Promise<ProjectDto> {
    const organizationId = actor.organizationId;
    const existing = await ProjectRepository.findByKey(organizationId, input.key);
    if (existing) {
      throw new ConflictError(`A project with key ${input.key} already exists.`);
    }
    const project = await ProjectRepository.createWithLead({
      organizationId,
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      creatorId: actor.userId,
    });
    return toDto(project, "LEAD");
  },

  async get(actor: Actor, projectId: string): Promise<ProjectDto> {
    const project = await requireProject(projectId, actor);
    const membership = await ProjectRepository.findMember(projectId, actor.userId);
    return toDto(project, membership?.role ?? null);
  },

  // LEAD-only. Status changes (archive/unarchive) are settings, allowed
  // even while ARCHIVED — BR-4's read-only rule applies to project
  // content (issues, sprints, membership), not to LEAD settings.
  async update(
    actor: Actor,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectDto> {
    await requireProject(projectId, actor);
    await requireLead(projectId, actor);
    const updated = await ProjectRepository.update(projectId, input, actor.userId);
    return toDto(updated, "LEAD");
  },

  // BR-5: soft delete, audit-logged (Security Architecture §5).
  async delete(actor: Actor, projectId: string): Promise<void> {
    const project = await requireProject(projectId, actor);
    await requireLead(projectId, actor);
    await ProjectRepository.softDelete(projectId, actor.userId);
    await AuditLogService.record({
      organizationId: project.organizationId,
      actorId: actor.userId,
      action: "PROJECT_DELETED",
      entityType: "Project",
      entityId: projectId,
      beforeData: { key: project.key, name: project.name },
    });
  },

  async listMembers(actor: Actor, projectId: string): Promise<ProjectMemberDto[]> {
    await requireProject(projectId, actor);
    const members = await ProjectRepository.listMembers(projectId);
    return members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
    }));
  },

  // LEAD-only; BR-4 blocks membership changes on ARCHIVED projects;
  // BR-6: only existing, active org users (added by email — see
  // 03_projects.md §API note).
  async addMember(
    actor: Actor,
    projectId: string,
    input: AddProjectMemberInput,
  ): Promise<ProjectMemberDto> {
    const project = await requireProject(projectId, actor);
    await requireLead(projectId, actor);
    if (project.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    const user = await ProjectRepository.findUserByEmail(input.email);
    if (!user || user.deletedAt || !user.isActive) {
      throw new ValidationError("No active user exists with that email.");
    }
    const existing = await ProjectRepository.findMemberIncludingRemoved(
      projectId,
      user.id,
    );
    if (existing && !existing.deletedAt) {
      throw new ConflictError("That user is already a member of this project.");
    }
    const member = existing
      ? await ProjectRepository.restoreMember(existing.id, input.role, actor.userId)
      : await ProjectRepository.addMember(
          projectId,
          user.id,
          input.role,
          actor.userId,
        );
    const [dto] = (await this.listMembers(actor, projectId)).filter(
      (entry) => entry.id === member.id,
    );
    if (!dto) throw new NotFoundError("Member not found after creation.");
    return dto;
  },

  // BR-3: a project must always keep at least one LEAD.
  async changeMemberRole(
    actor: Actor,
    projectId: string,
    memberId: string,
    input: UpdateProjectMemberInput,
  ): Promise<void> {
    const project = await requireProject(projectId, actor);
    await requireLead(projectId, actor);
    if (project.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    const member = await ProjectRepository.findMemberById(memberId);
    if (!member || member.projectId !== projectId) {
      throw new NotFoundError("Member not found.");
    }
    if (member.role === "LEAD" && input.role !== "LEAD") {
      const leads = await ProjectRepository.countLeads(projectId);
      if (leads <= 1) {
        throw new ConflictError(
          "A project must have at least one LEAD — promote someone else first.",
        );
      }
    }
    await ProjectRepository.updateMemberRole(memberId, input.role, actor.userId);
    await AuditLogService.record({
      organizationId: project.organizationId,
      actorId: actor.userId,
      action: "ROLE_CHANGED",
      entityType: "ProjectMember",
      entityId: memberId,
      beforeData: { role: member.role },
      afterData: { role: input.role },
    });
  },

  async removeMember(
    actor: Actor,
    projectId: string,
    memberId: string,
  ): Promise<void> {
    const project = await requireProject(projectId, actor);
    await requireLead(projectId, actor);
    if (project.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    const member = await ProjectRepository.findMemberById(memberId);
    if (!member || member.projectId !== projectId) {
      throw new NotFoundError("Member not found.");
    }
    if (member.role === "LEAD") {
      const leads = await ProjectRepository.countLeads(projectId);
      if (leads <= 1) {
        throw new ConflictError(
          "A project must have at least one LEAD — promote someone else first.",
        );
      }
    }
    await ProjectRepository.removeMember(memberId, actor.userId);
  },
};
