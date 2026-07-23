import type { Actor } from "@/shared/types/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import { getAllowedEmailDomains } from "@/shared/lib/env";
import { AdminCapability, requireCapability } from "@/features/admin/authz/capabilities";
import { AuditAction } from "@/features/admin/audit/audit-actions";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { UserManagementRepository } from "@/features/user-management/repositories/user-management.repository";
import type {
  ManagedUserDto,
  ManagedUserPageDto,
} from "@/features/user-management/types/user-management.types";
import type {
  InviteUserInput,
  UpdateUserAdminInput,
  UserListQuery,
} from "@/features/user-management/validation/user-management.schemas";

type UserRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  orgRole: "ADMIN" | "MEMBER";
  isActive: boolean;
  lastLoginAt: Date | null;
  passwordHash: string | null;
  createdAt: Date;
};

function toDto(row: UserRow): ManagedUserDto {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatarUrl: row.avatarUrl,
    orgRole: row.orgRole,
    isActive: row.isActive,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    hasSignedIn: row.lastLoginAt !== null || row.passwordHash !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const UserManagementService = {
  async list(actor: Actor, query: UserListQuery): Promise<ManagedUserPageDto> {
    requireCapability(actor, AdminCapability.MANAGE_USERS);
    const { rows, total } = await UserManagementRepository.list({
      organizationId: actor.organizationId,
      q: query.q,
      role: query.role,
      status: query.status,
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    return {
      data: rows.map(toDto),
      pagination: { page: query.page, pageSize: query.pageSize, total },
    };
  },

  async invite(actor: Actor, input: InviteUserInput): Promise<ManagedUserDto> {
    requireCapability(actor, AdminCapability.MANAGE_USERS);

    // BR-3: enforce the domain allow-list at invite time (fail fast).
    const allowed = getAllowedEmailDomains();
    if (allowed.length > 0) {
      const domain = input.email.split("@")[1] ?? "";
      if (!allowed.includes(domain)) {
        throw new ValidationError(
          `Email domain is not allowed. Permitted: ${allowed.join(", ")}.`,
        );
      }
    }

    // BR-2: a pre-existing row (in any org — email is globally unique) means we
    // can't create a duplicate; surface it rather than silently colliding.
    const existing = await UserManagementRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError("A user with that email already exists.");
    }

    const created = await UserManagementRepository.invite({
      organizationId: actor.organizationId,
      email: input.email,
      name: input.name,
      orgRole: input.orgRole,
      actorId: actor.userId,
    });

    await AuditLogService.record({
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action: AuditAction.USER_INVITED,
      entityType: "User",
      entityId: created.id,
      afterData: { email: created.email, name: created.name, orgRole: created.orgRole },
    });

    return toDto(created);
  },

  async update(
    actor: Actor,
    userId: string,
    input: UpdateUserAdminInput,
  ): Promise<ManagedUserDto> {
    requireCapability(actor, AdminCapability.MANAGE_USERS);

    // F-1: only users in the actor's own org (never reveal another tenant's).
    const target = await UserManagementRepository.findInOrg(actor.organizationId, userId);
    if (!target) throw new NotFoundError("User not found.");

    const nextRole = input.orgRole ?? target.orgRole;
    const nextActive = input.isActive ?? target.isActive;

    // BR-5/BR-9: the org must always keep at least one active ADMIN. If this
    // change would strip the target's active-admin status, ensure someone else
    // still holds it.
    const wasActiveAdmin = target.orgRole === "ADMIN" && target.isActive;
    const staysActiveAdmin = nextRole === "ADMIN" && nextActive;
    if (wasActiveAdmin && !staysActiveAdmin) {
      const others = await UserManagementRepository.countOtherActiveAdmins(
        actor.organizationId,
        target.id,
      );
      if (others === 0) {
        throw new ConflictError(
          "The organization must keep at least one active admin — promote someone else first.",
        );
      }
    }

    const updated = await UserManagementRepository.update(userId, {
      orgRole: input.orgRole,
      isActive: input.isActive,
      actorId: actor.userId,
    });

    // BR-7: audit role and status changes separately (each with before/after).
    if (input.orgRole !== undefined && input.orgRole !== target.orgRole) {
      await AuditLogService.record({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: AuditAction.USER_ROLE_CHANGED,
        entityType: "User",
        entityId: userId,
        beforeData: { orgRole: target.orgRole },
        afterData: { orgRole: updated.orgRole },
      });
    }
    if (input.isActive !== undefined && input.isActive !== target.isActive) {
      await AuditLogService.record({
        organizationId: actor.organizationId,
        actorId: actor.userId,
        action: AuditAction.USER_STATUS_CHANGED,
        entityType: "User",
        entityId: userId,
        beforeData: { isActive: target.isActive },
        afterData: { isActive: updated.isActive },
      });
    }

    return toDto(updated);
  },
};
