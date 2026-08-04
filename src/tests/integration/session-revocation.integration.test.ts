import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { UserRepository } from "@/features/authentication/repositories/user.repository";

// F2 (ADR-0029): getActor re-reads live account state every request. This
// proves the query that backs it — the recheck that makes deactivation and
// role changes take effect immediately rather than on 30-day JWT expiry.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

async function makeUser(role: "ADMIN" | "MEMBER", isActive: boolean) {
  const org = await prisma.organization.create({
    data: { name: "acme", domain: "acme.example.com" },
  });
  const user = await prisma.user.create({
    data: {
      organizationId: org.id,
      email: `u-${Math.random()}@acme.example.com`,
      name: "U",
      orgRole: role,
      isActive,
    },
  });
  return { org, user };
}

describe("findActorState (session revocation source of truth)", () => {
  it("returns live isActive/orgRole/organizationId for an active user", async () => {
    const { org, user } = await makeUser("MEMBER", true);
    const state = await UserRepository.findActorState(user.id);
    expect(state).toEqual({
      isActive: true,
      orgRole: "MEMBER",
      organizationId: org.id,
    });
  });

  it("reports isActive=false once a user is deactivated (getActor → revoked)", async () => {
    const { user } = await makeUser("MEMBER", true);
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const state = await UserRepository.findActorState(user.id);
    expect(state?.isActive).toBe(false);
  });

  it("reflects a role change immediately (demoted admin → MEMBER)", async () => {
    const { user } = await makeUser("ADMIN", true);
    await prisma.user.update({ where: { id: user.id }, data: { orgRole: "MEMBER" } });
    const state = await UserRepository.findActorState(user.id);
    expect(state?.orgRole).toBe("MEMBER");
  });

  it("returns null for a non-existent user (fail closed)", async () => {
    expect(await UserRepository.findActorState("does-not-exist")).toBeNull();
  });
});
