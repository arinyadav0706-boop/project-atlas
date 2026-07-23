import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/shared/lib/db";
import { UserManagementService } from "@/features/user-management/services/user-management.service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Integration — real Postgres. Proves the user lifecycle (14_user_management.md):
// invite → list → role change → deactivate, the last-admin guard, F-1 scope, and
// that deactivation preserves the row (soft auth-boundary, not a delete).

vi.mock("@/shared/lib/env", () => ({ getAllowedEmailDomains: vi.fn(() => []) }));

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: tag, domain: `${tag}.example.com` },
  });
  const admin = await prisma.user.create({
    data: { organizationId: org.id, email: `admin-${tag}@x.com`, name: "Admin", orgRole: "ADMIN" },
  });
  const actor: Actor = { userId: admin.id, orgRole: "ADMIN", organizationId: org.id };
  return { org, admin, actor };
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("User Management integration", () => {
  it("invites a user who then appears in the list", async () => {
    const a = await seed("inv");
    const invited = await UserManagementService.invite(a.actor, {
      email: "new@x.com",
      name: "New Person",
      orgRole: "MEMBER",
    });
    expect(invited.hasSignedIn).toBe(false); // pre-provisioned

    const page = await UserManagementService.list(a.actor, { page: 1, pageSize: 25 });
    expect(page.data.map((u) => u.email)).toContain("new@x.com");
  });

  it("filters by role and status and searches by name/email", async () => {
    const a = await seed("filt");
    await UserManagementService.invite(a.actor, { email: "alice@x.com", name: "Alice", orgRole: "MEMBER" });
    await UserManagementService.invite(a.actor, { email: "bob@x.com", name: "Bob", orgRole: "ADMIN" });

    const admins = await UserManagementService.list(a.actor, { page: 1, pageSize: 25, role: "ADMIN" });
    expect(admins.data.every((u) => u.orgRole === "ADMIN")).toBe(true);

    const search = await UserManagementService.list(a.actor, { page: 1, pageSize: 25, q: "alice" });
    expect(search.data).toHaveLength(1);
    expect(search.data[0]?.email).toBe("alice@x.com");
  });

  it("deactivation flips isActive but keeps the row (BR-4), and reactivation restores it", async () => {
    const a = await seed("deact");
    const member = await UserManagementService.invite(a.actor, {
      email: "m@x.com",
      name: "Member",
      orgRole: "MEMBER",
    });
    await UserManagementService.update(a.actor, member.id, { isActive: false });

    const row = await prisma.user.findUnique({ where: { id: member.id } });
    expect(row).not.toBeNull(); // not deleted
    expect(row?.isActive).toBe(false);
    expect(row?.deletedAt).toBeNull();

    const reactivated = await UserManagementService.update(a.actor, member.id, { isActive: true });
    expect(reactivated.isActive).toBe(true);
  });

  it("enforces at-least-one-active-admin on demote and deactivate (BR-5)", async () => {
    const a = await seed("guard"); // one admin (the actor)
    await expect(
      UserManagementService.update(a.actor, a.admin.id, { orgRole: "MEMBER" }),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      UserManagementService.update(a.actor, a.admin.id, { isActive: false }),
    ).rejects.toBeInstanceOf(ConflictError);

    // With a second admin, demoting the first is allowed.
    const second = await UserManagementService.invite(a.actor, {
      email: "admin2@x.com",
      name: "Admin Two",
      orgRole: "ADMIN",
    });
    const demoted = await UserManagementService.update(a.actor, a.admin.id, { orgRole: "MEMBER" });
    expect(demoted.orgRole).toBe("MEMBER");
    expect(second.orgRole).toBe("ADMIN");
  });

  it("records audit entries for invite / role / status changes (BR-7)", async () => {
    const a = await seed("aud");
    const u = await UserManagementService.invite(a.actor, { email: "z@x.com", name: "Z", orgRole: "MEMBER" });
    await UserManagementService.update(a.actor, u.id, { orgRole: "ADMIN" });
    await UserManagementService.update(a.actor, u.id, { isActive: false });

    const actions = (
      await prisma.auditLog.findMany({ where: { organizationId: a.org.id, entityId: u.id } })
    ).map((e) => e.action);
    expect(actions).toContain("USER_INVITED");
    expect(actions).toContain("USER_ROLE_CHANGED");
    expect(actions).toContain("USER_STATUS_CHANGED");
  });

  it("cannot see or modify a user in another org (F-1)", async () => {
    const a = await seed("fa");
    const b = await seed("fb");
    await expect(
      UserManagementService.update(a.actor, b.admin.id, { isActive: false }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // b's admin is untouched.
    const row = await prisma.user.findUnique({ where: { id: b.admin.id } });
    expect(row?.isActive).toBe(true);
  });

  it("a non-admin is denied (MANAGE_USERS)", async () => {
    const a = await seed("deny");
    const memberActor: Actor = { userId: a.admin.id, orgRole: "MEMBER", organizationId: a.org.id };
    await expect(
      UserManagementService.list(memberActor, { page: 1, pageSize: 25 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
