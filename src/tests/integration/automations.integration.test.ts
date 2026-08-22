import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { AutomationService } from "@/features/automations/services/automation.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { CommentService } from "@/features/comments/services/comment.service";
import { WorkflowService } from "@/features/workflow/services/workflow.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import { MAX_RULES_PER_PROJECT } from "@/features/automations/validation/automation.schemas";
import type { Actor } from "@/shared/types/actor";

// Tier 4 — Automations against a REAL Postgres (ADR-0050).
//
// The engine's own tests (lib/engine.test.ts) prove which rules WOULD run. This
// file proves what actually happens to the database when they do: that the loop
// guard holds across a real write, that an automated change is attributed to
// the rule and not to the person who tripped it, that a failing rule leaves the
// user's action alone, and that every evaluation lands in the run log.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}
beforeEach(reset);
afterAll(() => prisma.$disconnect());

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: tag, domain: `${tag}.example.com` },
  });
  const mk = (n: string, role: "ADMIN" | "MEMBER" = "MEMBER") =>
    prisma.user.create({
      data: { organizationId: org.id, email: `${n}-${tag}@x.com`, name: n, orgRole: role },
    });

  const admin = await mk("admin", "ADMIN");
  const lead = await mk("lead");
  const member = await mk("member");
  const viewer = await mk("viewer");

  const actor = (u: { id: string }, orgRole: "ADMIN" | "MEMBER" = "MEMBER"): Actor => ({
    userId: u.id,
    orgRole,
    organizationId: org.id,
  });

  const project = await ProjectService.create(actor(lead), {
    key: `A${tag}`.toUpperCase().slice(0, 8),
    name: "Project",
  });
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: member.id, role: "MEMBER" },
      { projectId: project.id, userId: viewer.id, role: "VIEWER" },
    ],
  });

  const leadActor = actor(lead);
  const statuses = await WorkflowService.listStatuses(leadActor, project.id);
  const byCategory = Object.fromEntries(statuses.map((s) => [s.category, s]));

  return {
    org,
    project,
    lead,
    member,
    viewer,
    statuses,
    byCategory,
    adminActor: actor(admin, "ADMIN"),
    leadActor,
    memberActor: actor(member),
    viewerActor: actor(viewer),
  };
}

const newIssue = (s: Awaited<ReturnType<typeof seed>>, over: Record<string, unknown> = {}) =>
  IssueService.create(s.leadActor, s.project.id, {
    type: "BUG",
    title: "Something broke",
    priority: "MEDIUM",
    ...over,
  });

describe("a rule reacts to a person's write (BR-4, AC-1)", () => {
  it("fires on create, with no conditions, and the issue really changes", async () => {
    const s = await seed("aa");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Escalate new bugs",
      trigger: "ISSUE_CREATED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_PRIORITY", priority: "HIGHEST" }],
    });

    const created = await newIssue(s);
    const after = await prisma.issue.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.priority).toBe("HIGHEST");
  });

  it("logs SUCCESS with a sentence saying what it did (BR-5)", async () => {
    const s = await seed("ab");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Escalate",
      trigger: "ISSUE_CREATED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_PRIORITY", priority: "HIGHEST" }],
    });
    const created = await newIssue(s);

    const runs = await AutomationService.runLog(s.memberActor, s.project.id, { take: 50 });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.outcome).toBe("SUCCESS");
    expect(runs[0]!.detail).toContain(created.key);
    expect(runs[0]!.detail).toContain("highest priority");
  });

  it("attributes the change to the RULE, never to the person who tripped it (BR-3)", async () => {
    const s = await seed("ac");
    const rule = await AutomationService.create(s.leadActor, s.project.id, {
      name: "Escalate",
      trigger: "ISSUE_CREATED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_PRIORITY", priority: "HIGHEST" }],
    });
    const created = await newIssue(s);

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: created.id } });
    // The lead created it; the rule changed it. An activity feed saying the
    // lead escalated their own bug is an audit log that lies.
    expect(after.updatedBy).toBe(rule.id);
    expect(after.updatedBy).not.toBe(s.leadActor.userId);
  });
});

// AC-12. Found in a browser, not in a test: the create form closed showing Low
// on an issue the rule had already escalated to High, and the only honest
// reading of that screen is "the automation is broken".
describe("the response reflects what the rule did", () => {
  it("returns the issue as the rule left it, not as it was a millisecond before", async () => {
    const s = await seed("ay");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Escalate",
      trigger: "ISSUE_CREATED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_PRIORITY", priority: "HIGHEST" }],
    });

    const created = await newIssue(s, { priority: "LOW" });
    expect(created.priority).toBe("HIGHEST");
  });

  it("returns the status a rule moved it to, from the transition endpoint", async () => {
    const s = await seed("az");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Escalate on move",
      trigger: "STATUS_CHANGED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_STATUS", statusId: s.byCategory.DONE!.id }],
    });
    const issue = await newIssue(s);

    const moved = await IssueService.transition(
      s.leadActor,
      issue.id,
      s.byCategory.IN_PROGRESS!.id,
      issue.version,
    );
    // The person asked for In Progress; the rule then moved it to Done. What
    // comes back is where the issue actually is.
    expect(moved.workflowStatus.name).toBe("Done");
  });

  it("does NOT re-read when no rule wrote — an unautomated project pays nothing", async () => {
    const s = await seed("ba");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Notify only",
      trigger: "ISSUE_CREATED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "NOTIFY", target: "REPORTER" }],
    });
    // A plan of nothing but notifications leaves the row current, so the
    // create path returns what it already had.
    const created = await newIssue(s, { priority: "LOW" });
    expect(created.priority).toBe("LOW");
  });
});

describe("the loop guard (BR-2, AC-4) — the property that makes this safe", () => {
  it("does not re-fire when the rule's own action is what the rule listens for", async () => {
    const s = await seed("ad");
    // The first rule anybody builds by accident.
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Ping-pong",
      trigger: "PRIORITY_CHANGED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_PRIORITY", priority: "HIGHEST" }],
    });
    const issue = await newIssue(s, { priority: "LOW" });

    await IssueService.update(s.leadActor, issue.id, {
      priority: "HIGH",
      expectedVersion: issue.version,
    });

    const runs = await AutomationService.runLog(s.leadActor, s.project.id, { take: 50 });
    // Exactly one: the human's change. The rule's own write produced no event.
    expect(runs).toHaveLength(1);
    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.priority).toBe("HIGHEST");
  });

  it("does not let two rules bounce a change between them", async () => {
    const s = await seed("ae");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "A escalates",
      trigger: "PRIORITY_CHANGED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_PRIORITY", priority: "HIGHEST" }],
    });
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "B de-escalates",
      trigger: "PRIORITY_CHANGED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_PRIORITY", priority: "LOWEST" }],
    });
    const issue = await newIssue(s, { priority: "MEDIUM" });

    await IssueService.update(s.leadActor, issue.id, {
      priority: "HIGH",
      expectedVersion: issue.version,
    });

    // Both rules evaluated once, on the human's event. Neither reacted to the
    // other, so the cascade terminates at depth one.
    const runs = await AutomationService.runLog(s.leadActor, s.project.id, { take: 50 });
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.outcome === "SUCCESS")).toBe(true);
  });
});

describe("conditions (AC-2)", () => {
  it("records SKIPPED naming the condition, and changes nothing", async () => {
    const s = await seed("af");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Only stories",
      trigger: "ISSUE_CREATED",
      enabled: true,
      conditions: [{ kind: "TYPE_IS", types: ["STORY"] }],
      actions: [{ kind: "SET_PRIORITY", priority: "HIGHEST" }],
    });
    const created = await newIssue(s, { type: "BUG", priority: "LOW" });

    const runs = await AutomationService.runLog(s.leadActor, s.project.id, { take: 50 });
    expect(runs[0]!.outcome).toBe("SKIPPED");
    expect(runs[0]!.detail).toContain("type is story");
    const after = await prisma.issue.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.priority).toBe("LOW");
  });

  it("a disabled rule never runs and never logs (BR-10, AC-8)", async () => {
    const s = await seed("ag");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Off",
      trigger: "ISSUE_CREATED",
      enabled: false,
      conditions: [],
      actions: [{ kind: "SET_PRIORITY", priority: "HIGHEST" }],
    });
    const created = await newIssue(s, { priority: "LOW" });

    expect(await AutomationService.runLog(s.leadActor, s.project.id, { take: 50 })).toHaveLength(
      0,
    );
    const after = await prisma.issue.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.priority).toBe("LOW");
  });
});

describe("actions go through the service layer (BR-7)", () => {
  it("SET_STATUS moves the issue AND keeps the status/category invariant", async () => {
    const s = await seed("ah");
    const done = s.byCategory.DONE!;
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Auto-close",
      trigger: "PRIORITY_CHANGED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_STATUS", statusId: done.id }],
    });
    const issue = await newIssue(s, { priority: "LOW" });
    await IssueService.update(s.leadActor, issue.id, {
      priority: "HIGH",
      expectedVersion: issue.version,
    });

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.statusId).toBe(done.id);
    // 30_workflow BR-2 — the denormalised category came with it.
    expect(after.status).toBe("DONE");
  });

  it("SET_STATUS obeys the project's transition rules (AC-7)", async () => {
    const s = await seed("ai");
    const todo = s.byCategory.TODO!;
    const done = s.byCategory.DONE!;
    // To Do → In Progress only. Done is unreachable in one hop.
    await WorkflowService.setTransitions(s.leadActor, s.project.id, {
      enforce: true,
      transitions: [{ fromStatusId: todo.id, toStatusId: s.byCategory.IN_PROGRESS!.id }],
    });
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Skip to done",
      trigger: "PRIORITY_CHANGED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_STATUS", statusId: done.id }],
    });
    const issue = await newIssue(s, { priority: "LOW" });
    await IssueService.update(s.leadActor, issue.id, {
      priority: "HIGH",
      expectedVersion: issue.version,
    });

    const runs = await AutomationService.runLog(s.leadActor, s.project.id, { take: 50 });
    expect(runs[0]!.outcome).toBe("FAILED");
    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    // The rule failed loudly; the issue stayed where the workflow allows.
    expect(after.statusId).toBe(todo.id);
  });

  it("runs several actions in order, and the run log names each", async () => {
    const s = await seed("aj");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Triage",
      trigger: "ISSUE_CREATED",
      enabled: true,
      conditions: [],
      actions: [
        { kind: "SET_PRIORITY", priority: "HIGHEST" },
        { kind: "ASSIGN", userId: s.member.id },
        { kind: "ADD_COMMENT", body: "Escalated automatically." },
      ],
    });
    const created = await newIssue(s);

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: created.id } });
    expect(after.priority).toBe("HIGHEST");
    expect(after.assigneeId).toBe(s.member.id);
    const runs = await AutomationService.runLog(s.leadActor, s.project.id, { take: 50 });
    expect(runs[0]!.outcome).toBe("SUCCESS");
    expect(runs[0]!.detail).toContain("highest priority");
    expect(runs[0]!.detail).toContain("assigned");
    expect(runs[0]!.detail).toContain("commented");
  });

  it("ADD_COMMENT is authored by the RULE, not by a user (ADR-0050 §4)", async () => {
    const s = await seed("ak");
    const rule = await AutomationService.create(s.leadActor, s.project.id, {
      name: "Checklist bot",
      trigger: "ISSUE_CREATED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "ADD_COMMENT", body: "Run the escalation checklist." }],
    });
    const created = await newIssue(s);

    const row = await prisma.comment.findFirstOrThrow({ where: { issueId: created.id } });
    expect(row.authorId).toBeNull();
    expect(row.automationRuleId).toBe(rule.id);

    // …and a reader sees the rule's name where an author would be.
    const page = await CommentService.list(s.memberActor, created.id);
    expect(page.items[0]!.author.name).toBe("Checklist bot");
    expect(page.items[0]!.author.isAutomation).toBe(true);
    // Nobody edits what an automation said.
    expect(page.items[0]!.canEdit).toBe(false);
  });

  it("a failing action leaves the earlier ones applied and the user's write intact (AC-3, AC-6)", async () => {
    const s = await seed("al");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Half-broken",
      trigger: "PRIORITY_CHANGED",
      enabled: true,
      conditions: [],
      actions: [
        { kind: "SET_PRIORITY", priority: "HIGHEST" },
        // A status from no project at all (BR-11, AC-9).
        { kind: "SET_STATUS", statusId: "status-that-never-existed" },
      ],
    });
    const issue = await newIssue(s, { priority: "LOW" });

    // The person's own change succeeds — an automation may never fail it.
    const updated = await IssueService.update(s.leadActor, issue.id, {
      priority: "HIGH",
      expectedVersion: issue.version,
    });
    expect(updated.id).toBe(issue.id);

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.priority).toBe("HIGHEST"); // action one stuck
    expect(after.statusId).toBe(s.byCategory.TODO!.id); // action two did not
    const runs = await AutomationService.runLog(s.leadActor, s.project.id, { take: 50 });
    expect(runs[0]!.outcome).toBe("FAILED");
    expect(runs[0]!.detail).toContain("highest priority");
  });

  it("NOTIFY reaches the assignee, typed as an automation", async () => {
    const s = await seed("am");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Tell the assignee",
      trigger: "PRIORITY_CHANGED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "NOTIFY", target: "ASSIGNEE" }],
    });
    const issue = await newIssue(s, { assigneeId: s.member.id, priority: "LOW" });
    await IssueService.update(s.leadActor, issue.id, {
      priority: "HIGH",
      expectedVersion: issue.version,
    });

    const rows = await prisma.notification.findMany({
      where: { userId: s.member.id, type: "AUTOMATION" },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.message).toContain("Tell the assignee");
  });
});

describe("triggers fire from the paths a person actually uses", () => {
  it("a board column drag fires STATUS_CHANGED, exactly as the status menu does", async () => {
    const s = await seed("an");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "On move",
      trigger: "STATUS_CHANGED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_PRIORITY", priority: "HIGHEST" }],
    });
    const issue = await newIssue(s, { priority: "LOW" });

    await IssueService.reorder(s.leadActor, issue.id, {
      scope: "board",
      statusId: s.byCategory.IN_PROGRESS!.id,
      expectedVersion: issue.version,
    });

    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.priority).toBe("HIGHEST");
  });

  it("an edit that changes nothing relevant fires nothing", async () => {
    const s = await seed("ao");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "On assign",
      trigger: "ASSIGNEE_CHANGED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_PRIORITY", priority: "HIGHEST" }],
    });
    const issue = await newIssue(s, { assigneeId: s.member.id, priority: "LOW" });

    // Re-sends the SAME assignee. Nothing changed, so nothing fired — otherwise
    // every save on the edit form would look like a reassignment.
    await IssueService.update(s.leadActor, issue.id, {
      assigneeId: s.member.id,
      title: "Renamed",
      expectedVersion: issue.version,
    });

    expect(await AutomationService.runLog(s.leadActor, s.project.id, { take: 50 })).toHaveLength(
      0,
    );
  });
});

describe("administration (BR-9, AC-10, AC-11)", () => {
  const rule = {
    name: "R",
    trigger: "ISSUE_CREATED" as const,
    enabled: true,
    conditions: [],
    actions: [{ kind: "SET_PRIORITY" as const, priority: "HIGH" as const }],
  };

  it("a MEMBER can read the rules and the run log but cannot create one", async () => {
    const s = await seed("ap");
    await AutomationService.create(s.leadActor, s.project.id, rule);

    const seen = await AutomationService.list(s.memberActor, s.project.id);
    expect(seen.rules).toHaveLength(1);
    expect(seen.canManage).toBe(false);
    await expect(
      AutomationService.runLog(s.memberActor, s.project.id, { take: 10 }),
    ).resolves.toEqual([]);
    await expect(
      AutomationService.create(s.memberActor, s.project.id, rule),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a VIEWER can read but not manage", async () => {
    const s = await seed("aq");
    const seen = await AutomationService.list(s.viewerActor, s.project.id);
    expect(seen.canManage).toBe(false);
    await expect(
      AutomationService.create(s.viewerActor, s.project.id, rule),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an org ADMIN manages without being a project member (ADR-0024)", async () => {
    const s = await seed("ar");
    const created = await AutomationService.create(s.adminActor, s.project.id, rule);
    expect(created.name).toBe("R");
  });

  it("another organization's project is a 404, never a 403 (F-1)", async () => {
    const s = await seed("as");
    const other = await seed("at");
    await expect(
      AutomationService.list(other.leadActor, s.project.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      AutomationService.create(other.leadActor, s.project.id, rule),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it(`refuses rule ${MAX_RULES_PER_PROJECT + 1} with a reason (AC-11)`, async () => {
    const s = await seed("au");
    for (let i = 0; i < MAX_RULES_PER_PROJECT; i++) {
      await AutomationService.create(s.leadActor, s.project.id, { ...rule, name: `R${i}` });
    }
    await expect(
      AutomationService.create(s.leadActor, s.project.id, rule),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("disabling is a PATCH, and the disabled rule stops firing", async () => {
    const s = await seed("av");
    const created = await AutomationService.create(s.leadActor, s.project.id, rule);
    await AutomationService.update(s.leadActor, created.id, { enabled: false });

    await newIssue(s, { priority: "LOW" });
    expect(await AutomationService.runLog(s.leadActor, s.project.id, { take: 50 })).toHaveLength(
      0,
    );
  });

  it("a soft-deleted rule stops firing but keeps its run history", async () => {
    const s = await seed("aw");
    const created = await AutomationService.create(s.leadActor, s.project.id, rule);
    await newIssue(s, { priority: "LOW" });
    await AutomationService.delete(s.leadActor, created.id);
    await newIssue(s, { priority: "LOW" });

    const runs = await AutomationService.runLog(s.leadActor, s.project.id, { take: 50 });
    // One run, from before the delete. The history of what an automation did
    // outlives the rule — that is the whole point of an audit log.
    expect(runs).toHaveLength(1);
  });
});

describe("a stored document that no longer parses (BR-6)", () => {
  it("is reported broken and skipped, never executed on a guess", async () => {
    const s = await seed("ax");
    const created = await AutomationService.create(s.leadActor, s.project.id, {
      name: "From the future",
      trigger: "ISSUE_CREATED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "SET_PRIORITY", priority: "HIGH" }],
    });
    // An action kind this version has never heard of — what a downgrade, or a
    // hand-edited row, actually looks like.
    await prisma.automationRule.update({
      where: { id: created.id },
      data: { actions: [{ kind: "LAUNCH_ROCKET", thrust: 11 }] },
    });

    const listed = await AutomationService.list(s.leadActor, s.project.id);
    expect(listed.rules[0]!.broken).toBeTruthy();

    const issue = await newIssue(s, { priority: "LOW" });
    const runs = await AutomationService.runLog(s.leadActor, s.project.id, { take: 50 });
    expect(runs[0]!.outcome).toBe("SKIPPED");
    expect(runs[0]!.detail).toContain("could not be read");
    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.priority).toBe("LOW");
  });
});
