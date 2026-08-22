import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueService } from "@/features/issues/services/issue.service";
import { CommentService } from "@/features/comments/services/comment.service";
import { ComponentService } from "@/features/components/services/component.service";
import { NotificationService } from "@/features/notifications/services/notification.service";
import { NOTIFICATION_TYPES } from "@/features/notifications/types/notification.types";
import { DependencyService } from "@/features/dependencies/services/dependency.service";
import type { Actor } from "@/shared/types/actor";
import { createProjectWithStatuses } from "./helpers/workflow";

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
  const project = await createProjectWithStatuses({
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

/**
 * The guard for backlog DEP-7, and for every future repeat of it.
 *
 * The defect: `UNBLOCKED` was added to `NotificationType` in schema.prisma but
 * the migration was never generated, so Postgres had no such value and every
 * insert threw. The fan-out is best-effort by design (ADR-0019) and swallowed
 * the error; the unit test mocked NotificationService and asserted only that it
 * had been CALLED. Nothing failed. The feature shipped dead.
 *
 * These two tests close both halves: the enum a developer reads must equal the
 * enum the database enforces, and every value must survive an actual write.
 */
describe("every notification type is real, not just declared", () => {
  it("the TypeScript union and the Postgres enum agree exactly", async () => {
    const rows = await prisma.$queryRaw<{ value: string }[]>`
      SELECT e.enumlabel AS value
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'NotificationType'
    `;
    const inDatabase = [...rows.map((r) => r.value)].sort();
    const inCode = [...NOTIFICATION_TYPES].sort();

    // Both directions matter. A value in code but not the database is DEP-7
    // exactly. A value in the database but not in code is a dead branch no
    // reader can account for.
    expect(inDatabase).toEqual(inCode);
  });

  it("every type can actually be written", async () => {
    const { lead, issue } = await seed("nt");
    // notify() drops the actor from its own recipients, so write directly:
    // this test is about the COLUMN accepting the value, not about fan-out.
    await prisma.notification.createMany({
      data: NOTIFICATION_TYPES.map((type) => ({
        userId: lead.id,
        type,
        entityType: "ISSUE" as const,
        entityId: issue.id,
        message: `${type} smoke`,
        createdBy: lead.id,
      })),
    });

    const written = await prisma.notification.findMany({
      where: { userId: lead.id },
      select: { type: true },
    });
    expect([...new Set(written.map((w) => w.type))].sort()).toEqual(
      [...NOTIFICATION_TYPES].sort(),
    );
  });
});

// BR-9 (27_dependencies.md) — the notification that shipped dead. Asserted
// through the real transition, not by calling the notifier directly, because
// what broke was the wiring between them.
describe("closing a blocker notifies whoever was waiting (UNBLOCKED)", () => {
  it("tells the assignee of the freed issue, and nobody else", async () => {
    const { project, asLead, asMember, member, lead } = await seed("nu");

    const blocker = await IssueService.create(asLead, project.id, {
      type: "TASK",
      title: "The blocker",
      priority: "MEDIUM",
    });
    const waiting = await IssueService.create(asLead, project.id, {
      type: "TASK",
      title: "The waiting one",
      priority: "MEDIUM",
      assigneeId: member.id,
    });
    await DependencyService.create(asLead, blocker.id, {
      type: "BLOCKS",
      direction: "outward",
      targetId: waiting.id,
    });

    // Walk the fixed workflow to DONE.
    let v = blocker.version;
    for (const status of ["IN_PROGRESS", "IN_REVIEW", "DONE"] as const) {
      v = (await IssueService.transition(asLead, blocker.id, status, v)).version;
    }

    const forMember = await NotificationService.list(asMember, {});
    const unblocked = forMember.items.filter((i) => i.type === "UNBLOCKED");
    expect(unblocked).toHaveLength(1);
    expect(unblocked[0]!.message).toContain(blocker.key);
    expect(unblocked[0]!.message).toContain(waiting.key);

    // The actor closed it, so the actor hears nothing about it.
    const forLead = await NotificationService.list(
      { userId: lead.id, orgRole: "MEMBER", organizationId: project.organizationId },
      {},
    );
    expect(forLead.items.some((i) => i.type === "UNBLOCKED")).toBe(false);
  });

  it("stays silent while a second blocker is still open", async () => {
    const { project, asLead, asMember, member } = await seed("nu2");

    const first = await IssueService.create(asLead, project.id, {
      type: "TASK", title: "Blocker one", priority: "MEDIUM",
    });
    const second = await IssueService.create(asLead, project.id, {
      type: "TASK", title: "Blocker two", priority: "MEDIUM",
    });
    const waiting = await IssueService.create(asLead, project.id, {
      type: "TASK", title: "Waiting on two things", priority: "MEDIUM", assigneeId: member.id,
    });
    for (const blocker of [first, second]) {
      await DependencyService.create(asLead, blocker.id, {
        type: "BLOCKS", direction: "outward", targetId: waiting.id,
      });
    }

    let v = first.version;
    for (const status of ["IN_PROGRESS", "IN_REVIEW", "DONE"] as const) {
      v = (await IssueService.transition(asLead, first.id, status, v)).version;
    }

    // Still blocked by `second`. Telling someone they are free while something
    // else blocks them is worse than saying nothing.
    const forMember = await NotificationService.list(asMember, {});
    expect(forMember.items.some((i) => i.type === "UNBLOCKED")).toBe(false);

    let v2 = second.version;
    for (const status of ["IN_PROGRESS", "IN_REVIEW", "DONE"] as const) {
      v2 = (await IssueService.transition(asLead, second.id, status, v2)).version;
    }
    const after = await NotificationService.list(asMember, {});
    expect(after.items.filter((i) => i.type === "UNBLOCKED")).toHaveLength(1);
  });
});
