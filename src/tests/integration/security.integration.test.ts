import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueService } from "@/features/issues/services/issue.service";
import { ConflictError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Tier 4 — adversarial checks against a REAL Postgres. Proves the defenses
// that must hold even when an attacker crafts requests directly (bypassing the
// UI): cross-tenant WRITES are refused, the fixed workflow can't be skipped,
// and archived projects are read-only.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({ data: { name: tag, domain: `${tag}.example.com` } });
  const user = await prisma.user.create({ data: { organizationId: org.id, email: `${tag}@example.com`, name: tag } });
  const project = await prisma.project.create({ data: { organizationId: org.id, key: tag.toUpperCase().slice(0, 8), name: tag, createdBy: user.id } });
  await prisma.projectMember.create({ data: { projectId: project.id, userId: user.id, role: "LEAD", createdBy: user.id } });
  return { org, user, project };
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("cross-tenant writes are refused", () => {
  it("a user cannot UPDATE an issue in another org's project", async () => {
    const a = await seed("wa");
    const b = await seed("wb");
    const bIssue = await prisma.issue.create({
      data: { projectId: b.project.id, key: "WB-1", type: "TASK", title: "b", reporterId: b.user.id },
    });
    const attacker: Actor = { userId: a.user.id, orgRole: "ADMIN", organizationId: a.org.id }; // even as org admin
    await expect(
      IssueService.update(attacker, bIssue.id, { title: "hacked" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    // And the row is untouched.
    const row = await prisma.issue.findUnique({ where: { id: bIssue.id } });
    expect(row?.title).toBe("b");
  });

  it("a user cannot DELETE an issue in another org's project", async () => {
    const a = await seed("da");
    const b = await seed("db");
    const bIssue = await prisma.issue.create({
      data: { projectId: b.project.id, key: "DB-1", type: "TASK", title: "b", reporterId: b.user.id },
    });
    const attacker: Actor = { userId: a.user.id, orgRole: "ADMIN", organizationId: a.org.id };
    await expect(IssueService.delete(attacker, bIssue.id)).rejects.toBeInstanceOf(NotFoundError);
    const row = await prisma.issue.findFirst({ where: { id: bIssue.id, deletedAt: null } });
    expect(row).not.toBeNull();
  });

  it("a user cannot transition an issue in another org's project", async () => {
    const a = await seed("ta");
    const b = await seed("tb");
    const bIssue = await prisma.issue.create({
      data: { projectId: b.project.id, key: "TB-1", type: "TASK", title: "b", reporterId: b.user.id },
    });
    const attacker: Actor = { userId: a.user.id, orgRole: "ADMIN", organizationId: a.org.id };
    await expect(
      IssueService.transition(attacker, bIssue.id, "IN_PROGRESS"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("the fixed workflow cannot be skipped via the service", () => {
  it("TODO → DONE is rejected (must pass through the workflow)", async () => {
    const { org, user, project } = await seed("wf");
    const issue = await prisma.issue.create({
      data: { projectId: project.id, key: "WF-1", type: "TASK", title: "x", reporterId: user.id, status: "TODO" },
    });
    const actor: Actor = { userId: user.id, orgRole: "MEMBER", organizationId: org.id };
    await expect(
      IssueService.transition(actor, issue.id, "DONE"),
    ).rejects.toBeInstanceOf(ValidationError);
    const row = await prisma.issue.findUnique({ where: { id: issue.id } });
    expect(row?.status).toBe("TODO"); // unchanged
  });
});

describe("archived projects are read-only", () => {
  it("creating an issue in an archived project is refused", async () => {
    const { org, user, project } = await seed("ar");
    await prisma.project.update({ where: { id: project.id }, data: { status: "ARCHIVED" } });
    const actor: Actor = { userId: user.id, orgRole: "MEMBER", organizationId: org.id };
    await expect(
      IssueService.create(actor, project.id, { type: "TASK", title: "nope", priority: "MEDIUM" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
