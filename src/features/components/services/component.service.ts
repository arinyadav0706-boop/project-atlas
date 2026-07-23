import { ComponentRepository } from "@/features/components/repositories/component.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { ComponentDto, ComponentListDto } from "@/features/components/types/component.types";
import type {
  CreateComponentInput,
  UpdateComponentInput,
} from "@/features/components/validation/component.schemas";

// Business rules: docs/02_Modules/18_components.md. Governance: ADR-0018.
// Components are project-scoped; CRUD is LEAD-only, apply is MEMBER/LEAD, and a
// component's lead auto-assigns unassigned issues it's added to (BR-3).

// Resolve a project scoped to the actor's org (F-1) + the caller's role.
async function resolveProject(actor: Actor, projectId: string) {
  const context = await ProjectService.getContext(projectId);
  if (!context || context.organizationId !== actor.organizationId) {
    throw new NotFoundError("Project not found.");
  }
  const role = await ProjectService.getMemberRole(projectId, actor.userId);
  return { context, role };
}

async function requireLead(actor: Actor, projectId: string, context: { status: string }) {
  if (context.status === "ARCHIVED") {
    throw new ConflictError("Archived projects are read-only.");
  }
  const role = await ProjectService.getMemberRole(projectId, actor.userId);
  if (role !== "LEAD") {
    throw new ForbiddenError("Only a project lead can manage components.");
  }
}

// A component owner (default assignee) must be a member of the same project
// (BR-5).
async function assertOwnerIsMember(projectId: string, ownerId: string | null | undefined) {
  if (!ownerId) return;
  const role = await ProjectService.getMemberRole(projectId, ownerId);
  if (!role) {
    throw new ValidationError("The chosen owner is not a member of this project.");
  }
}

// Map the repository row (DB term `lead`) to the DTO (public term `owner`).
type ComponentRow = Awaited<
  ReturnType<typeof ComponentRepository.listByProject>
>[number];

function toDto(row: ComponentRow): ComponentDto {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    owner: row.lead,
  };
}

export const ComponentService = {
  async list(actor: Actor, projectId: string): Promise<ComponentListDto> {
    const { role } = await resolveProject(actor, projectId);
    const rows = await ComponentRepository.listByProject(projectId);
    return { items: rows.map(toDto), canManage: role === "LEAD" };
  },

  // BR-1: LEAD-only create; case-insensitive dedup; lead must be a member.
  async create(
    actor: Actor,
    projectId: string,
    input: CreateComponentInput,
  ): Promise<ComponentDto> {
    const { context } = await resolveProject(actor, projectId);
    await requireLead(actor, projectId, context);
    const clash = await ComponentRepository.findByNameCI(projectId, input.name);
    if (clash) {
      throw new ConflictError(`A component named "${clash.name}" already exists.`);
    }
    await assertOwnerIsMember(projectId, input.ownerId);
    const component = await ComponentRepository.create({
      projectId,
      name: input.name,
      description: input.description ?? null,
      leadId: input.ownerId ?? null,
      actorId: actor.userId,
    });
    await AuditLogService.record({
      organizationId: context.organizationId,
      actorId: actor.userId,
      action: "COMPONENT_CREATED",
      entityType: "Component",
      entityId: component.id,
      afterData: { projectId, name: component.name, ownerId: component.lead?.id ?? null },
    });
    return toDto(component);
  },

  // BR-1: LEAD-only edit.
  async update(
    actor: Actor,
    componentId: string,
    input: UpdateComponentInput,
  ): Promise<ComponentDto> {
    const existing = await ComponentRepository.findById(componentId);
    if (!existing || existing.project.organizationId !== actor.organizationId) {
      throw new NotFoundError("Component not found.");
    }
    const { context } = await resolveProject(actor, existing.projectId);
    await requireLead(actor, existing.projectId, context);
    if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      const clash = await ComponentRepository.findByNameCI(existing.projectId, input.name);
      if (clash && clash.id !== componentId) {
        throw new ConflictError(`A component named "${clash.name}" already exists.`);
      }
    }
    if (input.ownerId !== undefined) {
      await assertOwnerIsMember(existing.projectId, input.ownerId);
    }
    const component = await ComponentRepository.update(componentId, {
      name: input.name,
      description: input.description,
      leadId: input.ownerId,
      actorId: actor.userId,
    });
    await AuditLogService.record({
      organizationId: context.organizationId,
      actorId: actor.userId,
      action: "COMPONENT_UPDATED",
      entityType: "Component",
      entityId: componentId,
    });
    return toDto(component);
  },

  // BR-1 + BR-7: LEAD-only soft delete; detaches from issues.
  async delete(actor: Actor, componentId: string): Promise<void> {
    const existing = await ComponentRepository.findById(componentId);
    if (!existing || existing.project.organizationId !== actor.organizationId) {
      throw new NotFoundError("Component not found.");
    }
    const { context } = await resolveProject(actor, existing.projectId);
    await requireLead(actor, existing.projectId, context);
    await ComponentRepository.softDelete(componentId, actor.userId);
    await AuditLogService.record({
      organizationId: context.organizationId,
      actorId: actor.userId,
      action: "COMPONENT_DELETED",
      entityType: "Component",
      entityId: componentId,
      beforeData: { name: existing.name },
    });
  },

  async listForIssue(actor: Actor, issueId: string): Promise<ComponentDto[]> {
    const issue = await IssueRepository.findProjectId(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const context = await ProjectService.getContext(issue.projectId);
    if (!context || context.organizationId !== actor.organizationId) {
      throw new NotFoundError("Issue not found.");
    }
    const rows = await ComponentRepository.listForIssue(issueId);
    return rows.map(toDto);
  },

  // BR-2 + BR-3: replace the issue's component set (MEMBER/LEAD). Newly added
  // components with a lead route the issue to that lead if it's unassigned.
  async setForIssue(
    actor: Actor,
    issueId: string,
    componentIds: string[],
  ): Promise<ComponentDto[]> {
    const issue = await IssueRepository.findProjectId(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const { context, role } = await resolveProject(actor, issue.projectId);
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }
    if (role !== "MEMBER" && role !== "LEAD") {
      throw new ForbiddenError("You need to be a project member to change components.");
    }

    const unique = [...new Set(componentIds)];
    const found = unique.length
      ? await ComponentRepository.listByIds(issue.projectId, unique)
      : [];
    if (found.length !== unique.length) {
      throw new NotFoundError("One or more components no longer exist in this project.");
    }

    const before = await ComponentRepository.listIdsForIssue(issueId);
    const beforeSet = new Set(before);
    await ComponentRepository.setForIssue(issueId, unique, actor.userId);

    // BR-3: first newly-added component that carries a lead routes an unassigned
    // issue to that lead. `assignIfUnassigned` is atomic — never overwrites.
    const addedWithLead = found.filter((c) => !beforeSet.has(c.id) && c.leadId);
    if (addedWithLead.length > 0) {
      await IssueRepository.assignIfUnassigned(issueId, addedWithLead[0]!.leadId!, actor.userId);
    }

    await AuditLogService.record({
      organizationId: context.organizationId,
      actorId: actor.userId,
      action: "ISSUE_COMPONENTS_SET",
      entityType: "Issue",
      entityId: issueId,
      afterData: { componentIds: unique },
    });
    const rows = await ComponentRepository.listForIssue(issueId);
    return rows.map(toDto);
  },
};
