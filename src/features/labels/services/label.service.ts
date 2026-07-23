import { LabelRepository } from "@/features/labels/repositories/label.repository";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { ProjectService } from "@/features/projects/services/project.service";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { LabelDto, LabelListDto } from "@/features/labels/types/label.types";
import type {
  CreateLabelInput,
  UpdateLabelInput,
} from "@/features/labels/validation/label.schemas";

// Business rules: docs/02_Modules/17_labels.md. Governance model: ADR-0018.
// RBAC is expressed as policy functions so a Phase-2 lockdown (restrict creation
// to LEAD/ADMIN) is a one-line change here, not a refactor across the module.

// BR-1: any org member may create.
function canCreateLabel(): boolean {
  return true;
}

// BR-2: org ADMIN, or a LEAD of any project (trusted curator).
function canManageLabels(actor: Actor, isLeadAnywhere: boolean): boolean {
  return actor.orgRole === "ADMIN" || isLeadAnywhere;
}

// Resolve an issue to its project + the caller's write right, scoped to the org
// (F-1). Applying labels needs MEMBER/LEAD on the issue's project (VIEWER can't).
async function resolveIssueForWrite(actor: Actor, issueId: string) {
  const issue = await IssueRepository.findProjectId(issueId);
  if (!issue) throw new NotFoundError("Issue not found.");
  const context = await ProjectService.getContext(issue.projectId);
  if (!context || context.organizationId !== actor.organizationId) {
    throw new NotFoundError("Issue not found.");
  }
  if (context.status === "ARCHIVED") {
    throw new ConflictError("Archived projects are read-only.");
  }
  const role = await ProjectService.getMemberRole(issue.projectId, actor.userId);
  if (role !== "MEMBER" && role !== "LEAD") {
    throw new ForbiddenError("You need to be a project member to change labels.");
  }
  return { issue, context };
}

export const LabelService = {
  async list(actor: Actor): Promise<LabelListDto> {
    const [items, isLeadAnywhere] = await Promise.all([
      LabelRepository.listByOrg(actor.organizationId),
      ProjectService.isLeadAnywhere(actor),
    ]);
    return {
      items,
      canCreate: canCreateLabel(),
      canManage: canManageLabels(actor, isLeadAnywhere),
    };
  },

  // BR-1 + BR-3: any member creates; case-insensitive dedup rejects `Bug` when
  // `bug` exists (the functional index is the race-proof backstop).
  async create(actor: Actor, input: CreateLabelInput): Promise<LabelDto> {
    const existing = await LabelRepository.findByNameCI(actor.organizationId, input.name);
    if (existing) {
      throw new ConflictError(`A label named "${existing.name}" already exists.`);
    }
    const label = await LabelRepository.create({
      organizationId: actor.organizationId,
      name: input.name,
      color: input.color,
      actorId: actor.userId,
    });
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "LABEL_CREATED",
      entityType: "Label",
      entityId: label.id,
      afterData: { name: label.name, color: label.color },
    });
    return label;
  },

  // BR-2: manage-gated. Renaming re-checks the case-insensitive uniqueness
  // (ignoring the label itself).
  async update(actor: Actor, labelId: string, input: UpdateLabelInput): Promise<LabelDto> {
    const existing = await LabelRepository.findById(labelId);
    if (!existing || existing.organizationId !== actor.organizationId) {
      throw new NotFoundError("Label not found.");
    }
    if (!canManageLabels(actor, await ProjectService.isLeadAnywhere(actor))) {
      throw new ForbiddenError("Only an admin or project lead can manage labels.");
    }
    if (input.name && input.name.toLowerCase() !== existing.name.toLowerCase()) {
      const clash = await LabelRepository.findByNameCI(actor.organizationId, input.name);
      if (clash && clash.id !== labelId) {
        throw new ConflictError(`A label named "${clash.name}" already exists.`);
      }
    }
    const label = await LabelRepository.update(labelId, {
      name: input.name,
      color: input.color,
      actorId: actor.userId,
    });
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "LABEL_UPDATED",
      entityType: "Label",
      entityId: labelId,
      beforeData: { name: existing.name, color: existing.color },
      afterData: { name: label.name, color: label.color },
    });
    return label;
  },

  // BR-2 + BR-6: manage-gated soft delete; detaches from issues.
  async delete(actor: Actor, labelId: string): Promise<void> {
    const existing = await LabelRepository.findById(labelId);
    if (!existing || existing.organizationId !== actor.organizationId) {
      throw new NotFoundError("Label not found.");
    }
    if (!canManageLabels(actor, await ProjectService.isLeadAnywhere(actor))) {
      throw new ForbiddenError("Only an admin or project lead can manage labels.");
    }
    await LabelRepository.softDelete(labelId, actor.userId);
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "LABEL_DELETED",
      entityType: "Label",
      entityId: labelId,
      beforeData: { name: existing.name },
    });
  },

  // Labels currently on an issue (read; org-scoped existence check).
  async listForIssue(actor: Actor, issueId: string): Promise<LabelDto[]> {
    const issue = await IssueRepository.findProjectId(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const context = await ProjectService.getContext(issue.projectId);
    if (!context || context.organizationId !== actor.organizationId) {
      throw new NotFoundError("Issue not found.");
    }
    return LabelRepository.listForIssue(issueId);
  },

  // BR-1: replace the issue's label set. Every id must be a live label in the
  // org (rejects cross-org/stale ids, F-1).
  async setForIssue(actor: Actor, issueId: string, labelIds: string[]): Promise<LabelDto[]> {
    const { issue } = await resolveIssueForWrite(actor, issueId);
    const unique = [...new Set(labelIds)];
    if (unique.length > 0) {
      const found = await LabelRepository.listByIds(actor.organizationId, unique);
      if (found.length !== unique.length) {
        throw new NotFoundError("One or more labels no longer exist.");
      }
    }
    await LabelRepository.setForIssue(issueId, unique, actor.userId);
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: "ISSUE_LABELS_SET",
      entityType: "Issue",
      entityId: issue.id,
      afterData: { labelIds: unique },
    });
    return LabelRepository.listForIssue(issueId);
  },
};
