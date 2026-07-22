import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueService } from "@/features/issues/services/issue.service";
import { CommentService } from "@/features/comments/services/comment.service";
import { ConflictError, ForbiddenError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Integration — real Postgres. Proves the comment write path end to end
// (08_comments.md, ADR-0016): create/list ordering + keyset, OCC edit, soft
// delete, and RBAC (author/LEAD/VIEWER).

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `Org ${tag}`, domain: `${tag}.example.com` },
  });
  const lead = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-lead@example.com`, name: `Lead ${tag}` },
  });
  const member = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-mem@example.com`, name: `Member ${tag}` },
  });
  const viewer = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-view@example.com`, name: `Viewer ${tag}` },
  });
  const project = await prisma.project.create({
    data: { organizationId: org.id, key: tag.toUpperCase(), name: `Project ${tag}`, createdBy: lead.id },
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
    title: "Discuss me",
    priority: "MEDIUM",
  });
  return { org, project, issue, asLead, asMember, asViewer };
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Comments integration", () => {
  it("creates and lists comments oldest-first", async () => {
    const { issue, asMember } = await seed("c1");
    await CommentService.create(asMember, issue.id, { body: "first" });
    await CommentService.create(asMember, issue.id, { body: "second" });

    const page = await CommentService.list(asMember, issue.id, {});
    expect(page.items.map((c) => c.body)).toEqual(["first", "second"]);
    expect(page.canComment).toBe(true);
  });

  it("keyset-paginates a long thread", async () => {
    const { issue, asMember } = await seed("pg");
    for (let n = 0; n < 5; n++) await CommentService.create(asMember, issue.id, { body: `n${n}` });

    const first = await CommentService.list(asMember, issue.id, { take: 2 });
    expect(first.items.map((c) => c.body)).toEqual(["n0", "n1"]);
    const second = await CommentService.list(asMember, issue.id, { take: 2, cursor: first.nextCursor! });
    expect(second.items.map((c) => c.body)).toEqual(["n2", "n3"]);
  });

  it("edits the author's own comment and sets editedAt; stale edit → 409", async () => {
    const { issue, asMember } = await seed("ed");
    const c = await CommentService.create(asMember, issue.id, { body: "typo" });

    const edited = await CommentService.update(asMember, c.id, { body: "fixed", expectedVersion: c.version });
    expect(edited.body).toBe("fixed");
    expect(edited.editedAt).not.toBeNull();
    expect(edited.version).toBe(c.version + 1);

    // A stale edit at the old version is rejected.
    await expect(
      CommentService.update(asMember, c.id, { body: "again", expectedVersion: c.version }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("lets a LEAD delete another member's comment; a MEMBER cannot", async () => {
    const { issue, asMember, asLead, asViewer } = await seed("del");
    const c = await CommentService.create(asMember, issue.id, { body: "moderate me" });

    // A different member (viewer here is not the author and not lead) is forbidden.
    await expect(CommentService.delete(asViewer, c.id)).rejects.toBeInstanceOf(ForbiddenError);

    await CommentService.delete(asLead, c.id);
    const page = await CommentService.list(asMember, issue.id, {});
    expect(page.items).toHaveLength(0); // soft-deleted, excluded
  });

  it("forbids a VIEWER from commenting", async () => {
    const { issue, asViewer } = await seed("vw");
    await expect(
      CommentService.create(asViewer, issue.id, { body: "nope" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
