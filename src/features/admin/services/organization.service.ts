import type { Actor } from "@/shared/types/actor";
import { NotFoundError } from "@/shared/lib/errors";
import { AdminCapability, requireCapability } from "@/features/admin/authz/capabilities";
import { AuditAction } from "@/features/admin/audit/audit-actions";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { OrganizationRepository } from "@/features/admin/repositories/organization.repository";
import type { OrgSettingsDto } from "@/features/admin/types/admin.types";
import type { UpdateOrganizationInput } from "@/features/admin/validation/admin.schemas";

function toDto(org: {
  id: string;
  name: string;
  domain: string;
  createdAt: Date;
  updatedAt: Date;
}): OrgSettingsDto {
  return {
    id: org.id,
    name: org.name,
    domain: org.domain,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

export const OrganizationService = {
  async getSettings(actor: Actor): Promise<OrgSettingsDto> {
    requireCapability(actor, AdminCapability.MANAGE_ORGANIZATION);
    // The actor's own org (F-1) — an admin can never read another tenant's org.
    const org = await OrganizationRepository.findById(actor.organizationId);
    if (!org) throw new NotFoundError("Organization not found.");
    return toDto(org);
  },

  async updateSettings(actor: Actor, input: UpdateOrganizationInput): Promise<OrgSettingsDto> {
    requireCapability(actor, AdminCapability.MANAGE_ORGANIZATION);
    const before = await OrganizationRepository.findById(actor.organizationId);
    if (!before) throw new NotFoundError("Organization not found.");

    const domain = input.domain ? input.domain : before.domain;
    const updated = await OrganizationRepository.update(actor.organizationId, {
      name: input.name,
      domain,
      updatedBy: actor.userId,
    });

    // Org settings changes are exactly the sensitive, infrequent admin action
    // the audit trail exists for (13_admin.md BR-3).
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AuditAction.ORG_SETTINGS_CHANGED,
      entityType: "Organization",
      entityId: actor.organizationId,
      beforeData: { name: before.name, domain: before.domain },
      afterData: { name: updated.name, domain: updated.domain },
    });

    return toDto(updated);
  },
};
