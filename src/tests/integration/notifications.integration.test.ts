import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueService } from "@/features/issues/services/issue.service";
import { CommentService } from "@/features/comments/services/comment.service";
import { ComponentService } from "@/features/components/services/component.service";
import { NotificationService } from "@/features/notifications/services/notification.service";
import type { Actor } from "@/shared/types/actor";

// Integration — real Postgres. Proves notification fan-out end to end
// (10_notifications.md, ADR-0019): ASSIGNED / COMMENT_ADDED / STATUS_CHANGED,
// actor-exclusion, notificationsEnabled honoring, component auto-assign, and
// read/unread.

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
  const project = await prisma.project.create({
    data: { organizationId: org.id, key: tag.toUpperCase().slice(0, 8), name: `P ${tag}`, createdBy: lead.id },
  });
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: lead.id, role: "LEAD", createdBy: lead.id },
      { projectId: project.id, userId: member.id, role: "MEMBER", createdBy: lead.id },
    ],
  });
  const asLead: Actor = { userId: lead.id, orgRole: "MEMBER", organizationId: org.id };
  const asMember: Actor = { userId: member.id, orgRole: "MEMBER", organizationId: org.id };
  // Reporter = lead (creator), unassigned.
  const issue = await IssueService.create(asLead, project.id, {
    type: "TASK",
    title: "Notify me",
    priority: "MEDIUM",
  });
  return { org, project, issue, lead, member, asLead, asMember };
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Notifications integration", () => {
  it("assigning an issue notifies the assignee, not the actor (ASSIGNED)", async () => {
    const { issue, asLead, asMember, member } = await seed("n1");
    await IssueService.update(asLead, issue.id, {
      assigneeId: member.id,
      expectedVersion: issue.version,
    });

    const forMember = await NotificationService.list(asMember, {});
    expect(forMember.unreadCount).toBe(1);
    expect(forMember.items[0]!.type).toBe("ASSIGNED");
    expect(forMember.items[0]!.link).toContain(`/issues/${issue.id}`);

    const forLead = await NotificationService.list(asLead, {});
    expect(forLead.unreadCount).toBe(0); // actor is never notified
  });

  it("a comment notifies the reporter (COMMENT_ADDED), excluding the commenter", async () => {
    const { issue, asMember, asLead } = await seed("n2");
    // Member comments; reporter is the lead → lead is notified, member is not.
    await CommentService.create(asMember, issue.id, { body: "look here" });

    const forLead = await NotificationService.list(asLead, {});
    expect(forLead.items.map((i) => i.type)).toContain("COMMENT_ADDED");

    const forMember = await NotificationService.list(asMember, {});
    expect(forMember.unreadCount).toBe(0);
  });

  it("a status change notifies assignee + reporter, excluding the actor", async () => {
    const { issue, asLead, asMember, member } = await seed("n3");
    await IssueService.update(asLead, issue.id, {
      assigneeId: member.id,
      expectedVersion: issue.version,
    });
    const afterAssign = await IssueService.get(asLead, issue.id);
    // Lead moves it forward; assignee (member) is notified, actor (lead) is not.
    await IssueService.transition(asLead, issue.id, "IN_PROGRESS", afterAssign.version);

    const forMember = await NotificationService.list(asMember, {});
    expect(forMember.items.map((i) => i.type)).toContain("STATUS_CHANGED");
  });

  it("honors notificationsEnabled = false (BR-2)", async () => {
    const { issue, asLead, asMember, member } = await seed("n4");
    await prisma.user.update({ where: { id: member.id }, data: { notificationsEnabled: false } });
    await IssueService.update(asLead, issue.id, {
      assigneeId: member.id,
      expectedVersion: issue.version,
    });
    const forMember = await NotificationService.list(asMember, {});
    expect(forMember.unreadCount).toBe(0);
  });

  it("does not notify on self-assignment", async () => {
    const { issue, asLead, lead } = await seed("n5");
    await IssueService.update(asLead, issue.id, {
      assigneeId: lead.id,
      expectedVersion: issue.version,
    });
    const forLead = await NotificationService.list(asLead, {});
    expect(forLead.unreadCount).toBe(0);
  });

  it("component owner auto-assign notifies the owner", async () => {
    const { project, issue, asLead, asMember, member } = await seed("n6");
    const component = await ComponentService.create(asLead, project.id, {
      name: "Payments",
      ownerId: member.id,
    });
    // Lead adds the component → routes the unassigned issue to member → notify.
    await ComponentService.setForIssue(asLead, issue.id, [component.id]);

    const forMember = await NotificationService.list(asMember, {});
    expect(forMember.items.map((i) => i.type)).toContain("ASSIGNED");
  });

  it("marks one and all as read", async () => {
    const { issue, asLead, asMember, member } = await seed("n7");
    await IssueService.update(asLead, issue.id, {
      assigneeId: member.id,
      expectedVersion: issue.version,
    });
    const page = await NotificationService.list(asMember, {});
    expect(page.unreadCount).toBe(1);

    await NotificationService.markRead(asMember, page.items[0]!.id);
    expect(await NotificationService.unreadCount(asMember)).toBe(0);

    // A second event, then mark-all.
    const v = (await IssueService.get(asLead, issue.id)).version;
    await IssueService.transition(asLead, issue.id, "IN_PROGRESS", v);
    expect(await NotificationService.unreadCount(asMember)).toBe(1);
    await NotificationService.markAllRead(asMember);
    expect(await NotificationService.unreadCount(asMember)).toBe(0);
  });
});
