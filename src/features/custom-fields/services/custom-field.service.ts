import type { Actor } from "@/shared/types/actor";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/shared/lib/errors";
import { AdminCapability, requireCapability } from "@/features/admin/authz/capabilities";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { AuditAction } from "@/features/admin/audit/audit-actions";
import { canManageProject, canWriteContent, elevate } from "@/features/authorization/permission";
import { ProjectService } from "@/features/projects/services/project.service";
import { CustomFieldRepository } from "@/features/custom-fields/repositories/custom-field.repository";
import { coerceValue, readValue } from "@/features/custom-fields/lib/coerce-value";
import type { StorableValue } from "@/features/custom-fields/lib/coerce-value";
import { hasOptions } from "@/features/custom-fields/types/custom-field.types";
import {
  isOperatorAllowed,
  type CustomFieldPredicate,
  type ResolvedPredicate,
} from "@/features/custom-fields/lib/field-predicate";
import { MAX_FIELDS_PER_PROJECT } from "@/features/custom-fields/validation/custom-field.schemas";
import type {
  CreateCustomFieldInput,
  SetIssueFieldValuesInput,
  SetProjectFieldsInput,
  UpdateCustomFieldInput,
} from "@/features/custom-fields/validation/custom-field.schemas";
import type {
  CustomFieldDefinitionDto,
  CustomFieldTypeDto,
  IssueCustomFieldDto,
  ProjectCustomFieldsDto,
} from "@/features/custom-fields/types/custom-field.types";

// Business rules: docs/02_Modules/24_custom_fields.md (ADR-0042). Three
// different authorities meet in this module and are deliberately kept apart:
//
//   defining a field   → org capability MANAGE_CUSTOM_FIELDS (BR-4)
//   enabling it here   → project LEAD                        (BR-6)
//   setting a value    → ordinary issue write                (BR-8)
//
// Conflating them is how a tracker ends up where only admins can fill in a
// field that every member is expected to fill in.

type DefinitionRow = Awaited<ReturnType<typeof CustomFieldRepository.findDefinition>>;

function toDefinitionDto(row: NonNullable<DefinitionRow>): CustomFieldDefinitionDto {
  return {
    id: row.id,
    name: row.name,
    type: row.type as CustomFieldTypeDto,
    description: row.description,
    required: row.required,
    options: row.options,
    projectCount: row._count.projects,
  };
}

export const CustomFieldService = {
  // ── The org field library (BR-4) ─────────────────────────────────────────

  async list(actor: Actor): Promise<CustomFieldDefinitionDto[]> {
    requireCapability(actor, AdminCapability.MANAGE_CUSTOM_FIELDS);
    const rows = await CustomFieldRepository.listDefinitions(actor.organizationId);
    return rows.map(toDefinitionDto);
  },

  async create(actor: Actor, input: CreateCustomFieldInput): Promise<CustomFieldDefinitionDto> {
    requireCapability(actor, AdminCapability.MANAGE_CUSTOM_FIELDS);

    const clash = await CustomFieldRepository.findByName(actor.organizationId, input.name);
    if (clash) throw new ConflictError("A field with that name already exists.");

    // A SELECT with no options is a control the user cannot use; a TEXT field
    // with options is a modelling mistake. Refuse both rather than storing
    // something the UI has to paper over.
    const typed = input.type as CustomFieldTypeDto;
    if (hasOptions(typed) && input.options.length === 0) {
      throw new ValidationError("A select field needs at least one option.");
    }
    if (!hasOptions(typed) && input.options.length > 0) {
      throw new ValidationError(`A ${typed} field doesn't take options.`);
    }

    const row = await CustomFieldRepository.createDefinition({
      organizationId: actor.organizationId,
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      required: input.required,
      options: input.options.map((o) => ({ label: o.label })),
      actorId: actor.userId,
    });

    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AuditAction.CUSTOM_FIELD_CREATED,
      entityType: "CustomFieldDefinition",
      entityId: row.id,
      afterData: { name: row.name, type: row.type, required: row.required },
    });
    return toDefinitionDto(row);
  },

  async update(
    actor: Actor,
    id: string,
    input: UpdateCustomFieldInput,
  ): Promise<CustomFieldDefinitionDto> {
    requireCapability(actor, AdminCapability.MANAGE_CUSTOM_FIELDS);
    const existing = await CustomFieldRepository.findDefinition(id, actor.organizationId);
    if (!existing) throw new NotFoundError("Field not found.");

    if (input.name) {
      const clash = await CustomFieldRepository.findByName(
        actor.organizationId,
        input.name,
        id,
      );
      if (clash) throw new ConflictError("A field with that name already exists.");
    }
    if (input.options && !hasOptions(existing.type as CustomFieldTypeDto)) {
      throw new ValidationError(`A ${existing.type} field doesn't take options.`);
    }
    if (input.options && hasOptions(existing.type as CustomFieldTypeDto) && input.options.length === 0) {
      throw new ValidationError("A select field needs at least one option.");
    }

    const row = await CustomFieldRepository.updateDefinition(id, {
      ...input,
      actorId: actor.userId,
    });

    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AuditAction.CUSTOM_FIELD_UPDATED,
      entityType: "CustomFieldDefinition",
      entityId: id,
      beforeData: { name: existing.name, required: existing.required },
      afterData: { name: row.name, required: row.required },
    });
    return toDefinitionDto(row);
  },

  async remove(actor: Actor, id: string): Promise<void> {
    requireCapability(actor, AdminCapability.MANAGE_CUSTOM_FIELDS);
    const existing = await CustomFieldRepository.findDefinition(id, actor.organizationId);
    if (!existing) throw new NotFoundError("Field not found.");

    // Soft delete: the value rows stay. They are facts about work that
    // happened, and retiring a field is not a reason to destroy them (BR-12).
    await CustomFieldRepository.softDeleteDefinition(id, actor.userId);
    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AuditAction.CUSTOM_FIELD_DELETED,
      entityType: "CustomFieldDefinition",
      entityId: id,
      beforeData: { name: existing.name, type: existing.type },
    });
  },

  // ── Per-project enablement (BR-5, BR-6) ──────────────────────────────────

  async forProject(actor: Actor, projectId: string): Promise<ProjectCustomFieldsDto> {
    const { role } = await this.resolveProject(actor, projectId);
    const [enabledRows, all] = await Promise.all([
      CustomFieldRepository.listForProject(projectId),
      CustomFieldRepository.listDefinitions(actor.organizationId),
    ]);
    const enabled = enabledRows.map((r) => toDefinitionDto(r.field));
    const enabledIds = new Set(enabled.map((f) => f.id));
    return {
      enabled,
      available: all.filter((f) => !enabledIds.has(f.id)).map(toDefinitionDto),
      canManage: canManageProject(role),
    };
  },

  async setForProject(
    actor: Actor,
    projectId: string,
    input: SetProjectFieldsInput,
  ): Promise<ProjectCustomFieldsDto> {
    const { role } = await this.resolveProject(actor, projectId);
    if (!canManageProject(role)) {
      throw new ForbiddenError("Only a project lead can change which fields this project shows.");
    }
    if (input.fieldIds.length > MAX_FIELDS_PER_PROJECT) {
      throw new ValidationError(
        `A project can show at most ${MAX_FIELDS_PER_PROJECT} fields.`,
      );
    }

    // Every id must be a live field in THIS org — otherwise a crafted request
    // could attach another tenant's definition to this project.
    const all = await CustomFieldRepository.listDefinitions(actor.organizationId);
    const known = new Set(all.map((f) => f.id));
    if (!input.fieldIds.every((id) => known.has(id))) {
      throw new ValidationError("One of those fields doesn't exist.");
    }

    await CustomFieldRepository.setForProject(projectId, input.fieldIds);
    return this.forProject(actor, projectId);
  },

  // ── Values on an issue (BR-8, BR-9) ──────────────────────────────────────

  /**
   * The fields to show on one issue, in the project's order, with this issue's
   * values (BR-14).
   *
   * Values for fields no longer enabled are simply not returned — the row is
   * kept, but a project that has retired a field should not still render it.
   */
  async forIssue(projectId: string, issueId: string): Promise<IssueCustomFieldDto[]> {
    const enabledRows = await CustomFieldRepository.listForProject(projectId);
    if (enabledRows.length === 0) return [];

    const values = await CustomFieldRepository.valuesForIssue(issueId);
    const byField = new Map(values.map((v) => [v.fieldId, v]));

    // Resolve USER values in one query rather than one per field.
    const userIds = enabledRows
      .map((r) => byField.get(r.field.id)?.valueUserId)
      .filter((id): id is string => Boolean(id));
    const users = userIds.length ? await CustomFieldRepository.usersByIds([...new Set(userIds)]) : [];
    const userById = new Map(users.map((u) => [u.id, u]));

    return enabledRows.map((r) => {
      const field = r.field;
      const type = field.type as CustomFieldTypeDto;
      const row = byField.get(field.id) ?? null;
      const value = readValue(row, type);
      return {
        fieldId: field.id,
        name: field.name,
        type,
        description: field.description,
        required: field.required,
        options: field.options,
        value,
        user:
          type === "USER" && typeof value === "string" ? (userById.get(value) ?? null) : null,
      };
    });
  },

  /**
   * Write values for one issue (BR-8, BR-9, BR-10).
   *
   * Every value is validated against its field's declared type before ANY of
   * them is written, so a batch with one bad value changes nothing — unlike
   * bulk edit across issues, these are fields of one object and a half-applied
   * form is a worse outcome than a rejected one.
   */
  async setForIssue(
    actor: Actor,
    issue: { id: string; projectId: string },
    input: SetIssueFieldValuesInput,
  ): Promise<IssueCustomFieldDto[]> {
    const { context, role } = await this.resolveProject(actor, issue.projectId);
    if (!canWriteContent(role)) {
      throw new ForbiddenError("You need to be a project member to edit this issue.");
    }
    if (context.status === "ARCHIVED") {
      throw new ConflictError("Archived projects are read-only.");
    }

    const enabledRows = await CustomFieldRepository.listForProject(issue.projectId);
    const byId = new Map(enabledRows.map((r) => [r.field.id, r.field]));

    const sets: { fieldId: string; value: StorableValue }[] = [];
    const clears: string[] = [];

    for (const [fieldId, raw] of Object.entries(input.values)) {
      const field = byId.get(fieldId);
      // Not enabled here is a client error, not something to silently ignore —
      // ignoring it means a form saves "successfully" and loses data.
      if (!field) throw new ValidationError("That field isn't enabled on this project.");

      const type = field.type as CustomFieldTypeDto;
      const result = coerceValue(raw, type, field.options);
      if (!result.ok) throw new ValidationError(`${field.name} ${result.error}.`);
      if ("clear" in result) {
        clears.push(fieldId);
        continue;
      }

      // A USER value must be a member of THIS issue's project — the same rule
      // the built-in assignee follows.
      if (type === "USER" && result.value.valueUserId) {
        const memberRole = await ProjectService.getMemberRole(
          issue.projectId,
          result.value.valueUserId,
        );
        if (!memberRole) {
          throw new ValidationError(`${field.name} must be a member of this project.`);
        }
      }
      sets.push({ fieldId, value: result.value });
    }

    await CustomFieldRepository.applyValues(issue.id, sets, clears, actor.userId);
    return this.forIssue(issue.projectId, issue.id);
  },

  /**
   * Required fields missing on a CREATE (BR-11).
   *
   * Returns the names of enabled required fields the payload does not satisfy.
   * Enforced only at creation: adding a required field to a project with 3,600
   * existing issues must not make all of them unsavable (ADR-0042 §4).
   */
  async missingRequired(projectId: string, values: Record<string, unknown>): Promise<string[]> {
    const enabledRows = await CustomFieldRepository.listForProject(projectId);
    return enabledRows
      .filter((r) => r.field.required)
      .filter((r) => {
        const raw = values[r.field.id];
        return raw === undefined || raw === null || raw === "" ||
          (Array.isArray(raw) && raw.length === 0);
      })
      .map((r) => r.field.name);
  },

  /**
   * Attach each predicate's declared TYPE from the definitions (ADR-0043 §2).
   *
   * This is the security boundary of custom-field filtering: the client sends a
   * field id and an operator, never a type, so it cannot aim a NUMBER field at
   * the text column or probe values across types.
   *
   * Anything unresolvable is DROPPED, not an error:
   *   - a field id from another org, or one that no longer exists
   *   - an operator the field's type does not support
   * A saved view naming a field somebody has since deleted must still open
   * (the same posture as a corrupt stored filter, ADR-0040 BR-8).
   */
  async resolvePredicates(
    actor: Actor,
    predicates: CustomFieldPredicate[] | undefined,
  ): Promise<ResolvedPredicate[]> {
    if (!predicates?.length) return [];
    const definitions = await CustomFieldRepository.listDefinitions(actor.organizationId);
    const typeById = new Map(definitions.map((d) => [d.id, d.type as CustomFieldTypeDto]));

    return predicates.flatMap((p) => {
      const type = typeById.get(p.fieldId);
      if (!type) return [];
      if (!isOperatorAllowed(type, p.op)) return [];
      return [{ ...p, type }];
    });
  },

  /**
   * Fields a reader can usefully filter by: everything in the org's library
   * that at least one project has enabled.
   *
   * Not gated on MANAGE_CUSTOM_FIELDS — that capability governs DEFINING a
   * field, not filtering by one. A member who can see an issue's custom field
   * must be able to filter on it, or the field is decoration.
   */
  async filterable(actor: Actor): Promise<CustomFieldDefinitionDto[]> {
    const definitions = await CustomFieldRepository.listDefinitions(actor.organizationId);
    return definitions.filter((d) => d._count.projects > 0).map(toDefinitionDto);
  },

  /** Project context + the caller's effective role, tenant-checked (F-1). */
  async resolveProject(actor: Actor, projectId: string) {
    const context = await ProjectService.getContext(projectId);
    if (!context || context.organizationId !== actor.organizationId) {
      throw new NotFoundError("Project not found.");
    }
    const role = elevate(actor, await ProjectService.getMemberRole(projectId, actor.userId));
    return { context, role };
  },
};
