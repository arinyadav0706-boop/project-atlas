import { beforeEach, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";

vi.mock("@/features/user-management/repositories/user-management.repository", () => ({
  UserManagementRepository: {
    list: vi.fn(),
    findByEmail: vi.fn(),
    findInOrg: vi.fn(),
    invite: vi.fn(),
    update: vi.fn(),
    countOtherActiveAdmins: vi.fn(),
  },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));
vi.mock("@/shared/lib/env", () => ({ getAllowedEmailDomains: vi.fn(() => []) }));

import { UserManagementRepository } from "@/features/user-management/repositories/user-management.repository";
import { AuditLogService } from "@/features/admin/services/audit-log.service";
import { getAllowedEmailDomains } from "@/shared/lib/env";
import { UserManagementService } from "./user-management.service";

const repo = vi.mocked(UserManagementRepository);
const audit = vi.mocked(AuditLogService);
const domains = vi.mocked(getAllowedEmailDomains);
const admin: Actor = { userId: "admin-1", orgRole: "ADMIN", organizationId: "org-1" };
const member: Actor = { userId: "m-1", orgRole: "MEMBER", organizationId: "org-1" };

function userRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "u-1",
    name: "Dev",
    email: "dev@x.com",
    avatarUrl: null,
    orgRole: "MEMBER",
    isActive: true,
    lastLoginAt: null,
    passwordHash: null,
    createdAt: new Date("2026-07-01"),
    ...over,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  domains.mockReturnValue([]);
});

it("all mutations require MANAGE_USERS (non-admin denied)", async () => {
  await expect(UserManagementService.list(member, { page: 1, pageSize: 25 })).rejects.toBeInstanceOf(ForbiddenError);
  await expect(
    UserManagementService.invite(member, { email: "a@x.com", name: "A", orgRole: "MEMBER" }),
  ).rejects.toBeInstanceOf(ForbiddenError);
  await expect(
    UserManagementService.update(member, "u-1", { isActive: false }),
  ).rejects.toBeInstanceOf(ForbiddenError);
});

it("invite rejects an out-of-domain email when an allow-list is set (BR-3)", async () => {
  domains.mockReturnValue(["consint.ai"]);
  await expect(
    UserManagementService.invite(admin, { email: "x@other.com", name: "X", orgRole: "MEMBER" }),
  ).rejects.toBeInstanceOf(ValidationError);
  expect(repo.invite).not.toHaveBeenCalled();
});

it("invite rejects a duplicate email (BR-2)", async () => {
  repo.findByEmail.mockResolvedValue(userRow() as never);
  await expect(
    UserManagementService.invite(admin, { email: "dev@x.com", name: "Dev", orgRole: "MEMBER" }),
  ).rejects.toBeInstanceOf(ConflictError);
});

it("invite creates the user and audits USER_INVITED", async () => {
  repo.findByEmail.mockResolvedValue(null);
  repo.invite.mockResolvedValue(userRow({ id: "new-1", email: "new@x.com", name: "New" }) as never);
  const dto = await UserManagementService.invite(admin, {
    email: "new@x.com",
    name: "New",
    orgRole: "MEMBER",
  });
  expect(dto.email).toBe("new@x.com");
  expect(audit.record).toHaveBeenCalledWith(
    expect.objectContaining({ action: "USER_INVITED", entityId: "new-1" }),
  );
});

it("update treats a user in another org as absent (F-1)", async () => {
  repo.findInOrg.mockResolvedValue(null);
  await expect(
    UserManagementService.update(admin, "u-9", { orgRole: "ADMIN" }),
  ).rejects.toBeInstanceOf(NotFoundError);
});

it("refuses to demote the last active admin (BR-5)", async () => {
  repo.findInOrg.mockResolvedValue(userRow({ id: "u-1", orgRole: "ADMIN", isActive: true }) as never);
  repo.countOtherActiveAdmins.mockResolvedValue(0);
  await expect(
    UserManagementService.update(admin, "u-1", { orgRole: "MEMBER" }),
  ).rejects.toBeInstanceOf(ConflictError);
  expect(repo.update).not.toHaveBeenCalled();
});

it("refuses to deactivate the last active admin (BR-5)", async () => {
  repo.findInOrg.mockResolvedValue(userRow({ id: "u-1", orgRole: "ADMIN", isActive: true }) as never);
  repo.countOtherActiveAdmins.mockResolvedValue(0);
  await expect(
    UserManagementService.update(admin, "u-1", { isActive: false }),
  ).rejects.toBeInstanceOf(ConflictError);
});

it("allows demoting an admin when another active admin remains, and audits the role change", async () => {
  repo.findInOrg.mockResolvedValue(userRow({ id: "u-1", orgRole: "ADMIN", isActive: true }) as never);
  repo.countOtherActiveAdmins.mockResolvedValue(1);
  repo.update.mockResolvedValue(userRow({ id: "u-1", orgRole: "MEMBER", isActive: true }) as never);
  const dto = await UserManagementService.update(admin, "u-1", { orgRole: "MEMBER" });
  expect(dto.orgRole).toBe("MEMBER");
  expect(audit.record).toHaveBeenCalledWith(
    expect.objectContaining({ action: "USER_ROLE_CHANGED", beforeData: { orgRole: "ADMIN" } }),
  );
});

it("deactivating a MEMBER is unaffected by the admin guard and audits status", async () => {
  repo.findInOrg.mockResolvedValue(userRow({ id: "u-2", orgRole: "MEMBER", isActive: true }) as never);
  repo.update.mockResolvedValue(userRow({ id: "u-2", orgRole: "MEMBER", isActive: false }) as never);
  await UserManagementService.update(admin, "u-2", { isActive: false });
  expect(repo.countOtherActiveAdmins).not.toHaveBeenCalled();
  expect(audit.record).toHaveBeenCalledWith(
    expect.objectContaining({ action: "USER_STATUS_CHANGED", afterData: { isActive: false } }),
  );
});

it("list scopes to the org and maps pagination", async () => {
  repo.list.mockResolvedValue({ rows: [userRow()], total: 1 } as never);
  const page = await UserManagementService.list(admin, { page: 1, pageSize: 25 });
  expect(repo.list).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org-1", skip: 0, take: 25 }));
  expect(page.data[0]?.email).toBe("dev@x.com");
  expect(page.pagination.total).toBe(1);
});
