import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueService } from "@/features/issues/services/issue.service";
import { LabelService } from "@/features/labels/services/label.service";
import { ComponentService } from "@/features/components/services/component.service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Integration — real Postgres. Proves labels + components end to end (ADR-0018,
// 17_labels.md, 18_components.md): case-insensitive uniqueness (the functional
// index), apply/replace, RBAC (create vs manage vs apply), component
// default-assignee routing (BR-3), soft-delete detach, and tenant scope (F-1).

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `Org ${tag}`, domain: `${tag}.example.com` },
  });
  const lead = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-lead@x.com`, name: `Lead ${tag}` },
  });
  const member = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-mem@x.com`, name: `Member ${tag}` },
  });
  const viewer = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-view@x.com`, name: `Viewer ${tag}` },
  });
  const project = await prisma.project.create({
    data: { organizationId: org.id, key: tag.toUpperCase().slice(0, 8), name: `P ${tag}`, createdBy: lead.id },
  });
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: lead.id, role: "LEAD", createdBy: lead.id },
      { projectId: project.id, userId: member.id, role: "MEMBER", createdBy: lead.id },
      { projectId: project.id, userId: viewer.id, role: "VIEWER", createdBy: lead.id },
    ],
  });
  const asLead: Actor = { userId: lead.id, orgRole: "MEMBER", organizationId: org.id };
  const asMember: Actor = { userId: member.id, orgRole: "MEMBER", organizationId: org.id };
  const asViewer: Actor = { userId: viewer.id, orgRole: "MEMBER", organizationId: org.id };
  const issue = await IssueService.create(asLead, project.id, {
    type: "TASK",
    title: "Classify me",
    priority: "MEDIUM",
  });
  return { org, project, issue, lead, member, asLead, asMember, asViewer };
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Labels integration", () => {
  it("a member creates + applies a label; case-insensitive dup is rejected", async () => {
    const { issue, asMember } = await seed("l1");
    const label = await LabelService.create(asMember, { name: "frontend", color: "#2563EB" });

    await expect(
      LabelService.create(asMember, { name: "Frontend", color: "#111111" }),
    ).rejects.toBeInstanceOf(ConflictError);

    const applied = await LabelService.setForIssue(asMember, issue.id, [label.id]);
    expect(applied.map((l) => l.name)).toEqual(["frontend"]);
  });

  it("a VIEWER cannot apply labels; a non-lead member cannot manage", async () => {
    const { issue, asMember, asViewer } = await seed("l2");
    const label = await LabelService.create(asMember, { name: "bug", color: "#DC2626" });

    await expect(
      LabelService.setForIssue(asViewer, issue.id, [label.id]),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      LabelService.update(asMember, label.id, { name: "defect" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(LabelService.delete(asMember, label.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a LEAD manages labels; soft-delete detaches from issues", async () => {
    const { issue, asLead, asMember } = await seed("l3");
    const label = await LabelService.create(asMember, { name: "urgent", color: "#EA580C" });
    await LabelService.setForIssue(asMember, issue.id, [label.id]);

    await LabelService.delete(asLead, label.id); // lead of a project => canManage
    const remaining = await LabelService.listForIssue(asMember, issue.id);
    expect(remaining).toHaveLength(0);
    // Name is reusable after soft delete (partial unique over live rows).
    await expect(
      LabelService.create(asMember, { name: "urgent", color: "#000000" }),
    ).resolves.toMatchObject({ name: "urgent" });
  });

  it("treats a label from another org as absent (F-1)", async () => {
    const a = await seed("la");
    const b = await seed("lb");
    const label = await LabelService.create(a.asMember, { name: "shared", color: "#16A34A" });
    await expect(
      LabelService.update(b.asMember, label.id, { name: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("Components integration", () => {
  it("LEAD creates a component; a MEMBER cannot", async () => {
    const { project, asLead, asMember } = await seed("c1");
    await expect(
      ComponentService.create(asMember, project.id, { name: "API" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const component = await ComponentService.create(asLead, project.id, { name: "API" });
    expect(component.name).toBe("API");

    await expect(
      ComponentService.create(asLead, project.id, { name: "api" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("adding a component with a lead auto-assigns an unassigned issue (BR-3)", async () => {
    const { project, issue, lead, asLead, asMember } = await seed("c2");
    const component = await ComponentService.create(asLead, project.id, {
      name: "Payments",
      leadId: lead.id,
    });
    await ComponentService.setForIssue(asMember, issue.id, [component.id]);

    const after = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
      select: { assigneeId: true },
    });
    expect(after.assigneeId).toBe(lead.id);
  });

  it("never overrides an existing assignee", async () => {
    const { project, issue, lead, member, asLead, asMember } = await seed("c3");
    // Pre-assign to the member.
    await prisma.issue.update({ where: { id: issue.id }, data: { assigneeId: member.id } });
    const component = await ComponentService.create(asLead, project.id, {
      name: "Infra",
      leadId: lead.id,
    });
    await ComponentService.setForIssue(asMember, issue.id, [component.id]);

    const after = await prisma.issue.findUniqueOrThrow({
      where: { id: issue.id },
      select: { assigneeId: true },
    });
    expect(after.assigneeId).toBe(member.id);
  });

  it("rejects a lead who is not a project member", async () => {
    const a = await seed("c4");
    const b = await seed("c5");
    await expect(
      ComponentService.create(a.asLead, a.project.id, { name: "X", leadId: b.member.id }),
    ).rejects.toBeInstanceOf(Error); // ValidationError
  });
});
