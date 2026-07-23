import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { ProjectService } from "@/features/projects/services/project.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { PermissionService } from "@/features/authorization/services/permission.service";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Integration — real Postgres. Proves ADR-0024: an org ADMIN is an effective
// LEAD on every project in ITS OWN org (even with no membership row), while
// tenant isolation (F-1) still blocks cross-org access.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: tag, domain: `${tag}.example.com` },
  });
  // The project's real LEAD is a normal member; the admin is deliberately NOT a
  // member of the project.
  const owner = await prisma.user.create({
    data: { organizationId: org.id, email: `owner-${tag}@x.com`, name: "Owner" },
  });
  const admin = await prisma.user.create({
    data: { organizationId: org.id, email: `admin-${tag}@x.com`, name: "Admin", orgRole: "ADMIN" },
  });
  const project = await prisma.project.create({
    data: { organizationId: org.id, key: tag.toUpperCase().slice(0, 8), name: tag, createdBy: owner.id },
  });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: owner.id, role: "LEAD", createdBy: owner.id },
  });
  const adminActor: Actor = { userId: admin.id, orgRole: "ADMIN", organizationId: org.id };
  return { org, owner, admin, adminActor, project };
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Org-admin-as-LEAD (ADR-0024)", () => {
  it("resolves an admin non-member to effective LEAD", async () => {
    const a = await seed("res");
    expect(await PermissionService.getEffectiveProjectRole(a.adminActor, a.project.id)).toBe("LEAD");
    // A real membership lookup still shows no row — elevation is virtual.
    expect(await ProjectService.getMemberRole(a.project.id, a.admin.id)).toBeNull();
  });

  it("lets an admin non-member perform a LEAD action (edit project settings)", async () => {
    const a = await seed("edit");
    const updated = await ProjectService.update(a.adminActor, a.project.id, { name: "Renamed by admin" });
    expect(updated.name).toBe("Renamed by admin");
  });

  it("lets an admin non-member create issues (MEMBER/LEAD action)", async () => {
    const a = await seed("create");
    const issue = await IssueService.create(a.adminActor, a.project.id, {
      type: "TASK",
      title: "Filed by admin",
      priority: "MEDIUM",
    });
    expect(issue.key).toMatch(/-\d+$/);
  });

  it("surfaces the admin's effective role as LEAD in the project DTO", async () => {
    const a = await seed("dto");
    const dto = await ProjectService.get(a.adminActor, a.project.id);
    expect(dto.myRole).toBe("LEAD");
  });

  it("does NOT let an admin act across organizations (F-1 preserved)", async () => {
    const a = await seed("orga");
    const b = await seed("orgb");
    // Admin of org A, acting on org B's project.
    await expect(
      ProjectService.update(a.adminActor, b.project.id, { name: "cross-org" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(await PermissionService.getEffectiveProjectRole(a.adminActor, b.project.id)).toBe("LEAD");
    // ^ the engine returns LEAD by role, but every service org-checks the
    // project first, so the cross-org action is still NotFound.
  });

  it("does not count the admin's virtual LEAD toward the last-LEAD guard", async () => {
    const a = await seed("guard");
    // The project has exactly one real LEAD (owner). Demoting them must fail
    // even though an admin exists — the guard counts real membership rows.
    const ownerMember = await prisma.projectMember.findFirstOrThrow({
      where: { projectId: a.project.id, userId: a.owner.id },
    });
    await expect(
      ProjectService.changeMemberRole(a.adminActor, a.project.id, ownerMember.id, { role: "MEMBER" }),
    ).rejects.toThrow(/at least one LEAD/);
  });
});
