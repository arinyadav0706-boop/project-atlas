import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { RecurrenceService } from "@/features/recurrence/services/recurrence.service";
import { AutomationService } from "@/features/automations/services/automation.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { WorkflowService } from "@/features/workflow/services/workflow.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { ForbiddenError, NotFoundError, ValidationError } from "@/shared/lib/errors";
import { MAX_RECURRENCES_PER_PROJECT } from "@/features/recurrence/validation/recurrence.schemas";
import type { Actor } from "@/shared/types/actor";

// Tier 4 — Recurring issues against a REAL Postgres (ADR-0051).
//
// The engine's own tests (lib/schedule.test.ts) prove WHEN a recurrence fires.
// This file proves what happens to the database when it does: that a tick
// creates exactly one issue however far behind it is, that two ticks racing
// create one between them, that after-completion schedules from the completion,
// and that a broken template records why and still moves on.

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
  const outsider = await mk("outsider");

  const actor = (u: { id: string }, orgRole: "ADMIN" | "MEMBER" = "MEMBER"): Actor => ({
    userId: u.id,
    orgRole,
    organizationId: org.id,
  });

  const project = await ProjectService.create(actor(lead), {
    key: `R${tag}`.toUpperCase().slice(0, 8),
    name: "Project",
  });
  await prisma.projectMember.create({
    data: { projectId: project.id, userId: member.id, role: "MEMBER" },
  });

  const leadActor = actor(lead);
  const statuses = await WorkflowService.listStatuses(leadActor, project.id);
  const byCategory = Object.fromEntries(statuses.map((s) => [s.category, s]));

  return {
    org,
    project,
    lead,
    member,
    outsider,
    byCategory,
    adminActor: actor(admin, "ADMIN"),
    leadActor,
    memberActor: actor(member),
  };
}

type Seeded = Awaited<ReturnType<typeof seed>>;

/** Monday 2 March 2026, 09:00 UTC — the reference the engine tests use too. */
const MONDAY_9AM = new Date("2026-03-02T09:00:00Z");
/**
 * The clock every test creates its recurrences against.
 *
 * Sunday 1 March, so a schedule starting Monday the 2nd is genuinely in the
 * future. Passed explicitly rather than mocked globally: a schedule is a
 * function of the clock, and a test that cannot set the clock can only assert
 * on dates it computed the same way the code did — which proves nothing.
 */
const CREATED_AT = new Date("2026-03-01T12:00:00Z");

const weekly = (s: Seeded, over: Record<string, unknown> = {}) =>
  RecurrenceService.create(
    s.leadActor,
    s.project.id,
    {
      name: "Monday standup",
      mode: "FIXED_SCHEDULE",
      frequency: "WEEKLY",
      interval: 1,
      startsOn: "2026-03-02T00:00:00.000Z",
      weekdays: [1],
      timeOfDay: 540,
      timeZone: "UTC",
      skipWeekends: false,
      skipIfOpen: false,
      title: "Run the standup",
      type: "TASK",
      priority: "MEDIUM",
      ...over,
    },
    CREATED_AT,
  );

const issuesOf = (recurrenceId: string) =>
  prisma.issue.findMany({
    where: { recurrenceId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

describe("a tick fires what is due (AC-1)", () => {
  it("creates exactly one issue and advances a week", async () => {
    const s = await seed("ra");
    const r = await weekly(s);
    expect(r.nextRunAt).toBe(MONDAY_9AM.toISOString());

    const tick = await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));
    expect(tick).toMatchObject({ claimed: 1, created: 1, failed: 0 });

    const made = await issuesOf(r.id);
    expect(made).toHaveLength(1);
    expect(made[0]!.title).toBe("Run the standup");

    const after = await prisma.recurringIssue.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.nextRunAt?.toISOString()).toBe("2026-03-09T09:00:00.000Z");
    expect(after.occurrences).toBe(1);
  });

  it("creates nothing when nothing is due", async () => {
    const s = await seed("rb");
    await weekly(s);
    const tick = await RecurrenceService.runDue(new Date("2026-03-01T09:00:00Z"));
    expect(tick).toMatchObject({ claimed: 0, created: 0 });
  });

  it("stamps out the template — type, priority, assignee, reporter, due date", async () => {
    const s = await seed("rc");
    const r = await weekly(s, {
      title: "Weekly report",
      type: "BUG",
      priority: "HIGH",
      assigneeId: s.member.id,
      reporterId: s.member.id,
      dueInDays: 3,
    });
    await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));

    const [made] = await issuesOf(r.id);
    expect(made).toMatchObject({
      title: "Weekly report",
      type: "BUG",
      priority: "HIGH",
      assigneeId: s.member.id,
      // BR-8: a real person, so "who do I ask" has an answer.
      reporterId: s.member.id,
    });
    expect(made!.dueDate).not.toBeNull();
  });
});

// BR-5. The property that lets the tick be a plain retryable URL.
describe("two ticks racing (AC-2)", () => {
  it("create ONE issue between them, not two", async () => {
    const s = await seed("rd");
    const r = await weekly(s);
    const at = new Date("2026-03-02T09:05:00Z");

    const [a, b] = await Promise.all([
      RecurrenceService.runDue(at),
      RecurrenceService.runDue(at),
    ]);

    expect(await issuesOf(r.id)).toHaveLength(1);
    // Exactly one of them won the claim; the other saw the row already moved.
    expect(a.claimed + b.claimed).toBe(1);
  });

  it("a second tick straight after the first does nothing", async () => {
    const s = await seed("re");
    const r = await weekly(s);
    await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));
    const again = await RecurrenceService.runDue(new Date("2026-03-02T09:06:00Z"));
    expect(again.claimed).toBe(0);
    expect(await issuesOf(r.id)).toHaveLength(1);
  });
});

// BR-4 — the difference between a restored service and an inbox full of spam.
describe("never backfilling (AC-3)", () => {
  it("a scheduler down for three weeks creates ONE issue, not three", async () => {
    const s = await seed("rf");
    const r = await weekly(s);
    // Nothing ran on the 2nd, 9th or 16th. It is now the 23rd.
    const tick = await RecurrenceService.runDue(new Date("2026-03-23T12:00:00Z"));

    expect(tick.created).toBe(1);
    expect(await issuesOf(r.id)).toHaveLength(1);
    const after = await prisma.recurringIssue.findUniqueOrThrow({ where: { id: r.id } });
    // …and it has skipped the gap entirely rather than queuing up the misses.
    expect(after.nextRunAt?.toISOString()).toBe("2026-03-30T09:00:00.000Z");
  });
});

describe("after completion (AC-4)", () => {
  const afterCompletion = (s: Seeded) =>
    RecurrenceService.create(s.leadActor, s.project.id, {
      name: "Service the machine",
      mode: "AFTER_COMPLETION",
      frequency: "WEEKLY",
      interval: 1,
      startsOn: "2026-03-02T00:00:00.000Z",
      weekdays: [],
      timeOfDay: 540,
      timeZone: "UTC",
      skipWeekends: false,
      skipIfOpen: false,
      intervalDays: 90,
      title: "Service",
      type: "TASK",
      priority: "MEDIUM",
    }, CREATED_AT);

  it("creates the first one on a tick, then nothing until it is closed", async () => {
    const s = await seed("rg");
    const r = await afterCompletion(s);

    await RecurrenceService.runDue(new Date("2026-03-02T09:00:00Z"));
    expect(await issuesOf(r.id)).toHaveLength(1);

    // A year of ticks with the first still open produces nothing more: the
    // clock is not what schedules this flavour.
    await RecurrenceService.runDue(new Date("2027-03-02T09:00:00Z"));
    expect(await issuesOf(r.id)).toHaveLength(1);
  });

  it("closing the instance schedules the next one intervalDays later", async () => {
    const s = await seed("rh");
    const r = await afterCompletion(s);
    await RecurrenceService.runDue(new Date("2026-03-02T09:00:00Z"));
    const [first] = await issuesOf(r.id);

    await IssueService.transition(
      s.leadActor,
      first!.id,
      s.byCategory.DONE!.id,
      first!.version,
    );

    const after = await prisma.recurringIssue.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.nextRunAt).not.toBeNull();
    // 90 CIVIL days on, at the recurrence's own 09:00 — not 90×24h from the
    // moment somebody happened to click Done.
    const expected = new Date(Date.now() + 90 * 86_400_000);
    expect(after.nextRunAt!.toISOString().slice(0, 10)).toBe(
      expected.toISOString().slice(0, 10),
    );
    expect(after.nextRunAt!.toISOString().slice(11, 16)).toBe("09:00");
  });

  it("a board drag into Done schedules it too, not only the status menu", async () => {
    const s = await seed("ri");
    const r = await afterCompletion(s);
    await RecurrenceService.runDue(new Date("2026-03-02T09:00:00Z"));
    const [first] = await issuesOf(r.id);
    await prisma.recurringIssue.update({ where: { id: r.id }, data: { nextRunAt: null } });

    await IssueService.reorder(s.leadActor, first!.id, {
      scope: "board",
      statusId: s.byCategory.DONE!.id,
      expectedVersion: first!.version,
    });

    const after = await prisma.recurringIssue.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.nextRunAt).not.toBeNull();
  });
});

describe("skipIfOpen (AC-5)", () => {
  it("skips while the last one is open, and resumes once it is closed", async () => {
    const s = await seed("rj");
    const r = await weekly(s, { frequency: "DAILY", weekdays: [], skipIfOpen: true });

    await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));
    expect(await issuesOf(r.id)).toHaveLength(1);

    // Next day, previous still open — skipped, and the run is not counted.
    const skipped = await RecurrenceService.runDue(new Date("2026-03-03T09:05:00Z"));
    expect(skipped).toMatchObject({ claimed: 1, created: 0, skipped: 1 });
    expect(await issuesOf(r.id)).toHaveLength(1);
    expect(
      (await prisma.recurringIssue.findUniqueOrThrow({ where: { id: r.id } })).occurrences,
    ).toBe(1);

    // Close it; the next day fires again.
    const [first] = await issuesOf(r.id);
    await IssueService.transition(s.leadActor, first!.id, s.byCategory.DONE!.id, first!.version);
    await RecurrenceService.runDue(new Date("2026-03-04T09:05:00Z"));
    expect(await issuesOf(r.id)).toHaveLength(2);
  });
});

describe("what it produced (AC-6)", () => {
  it("tags each issue and reports them on the recurrence", async () => {
    const s = await seed("rk");
    const r = await weekly(s);
    await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));
    await RecurrenceService.runDue(new Date("2026-03-09T09:05:00Z"));

    const listed = await RecurrenceService.list(s.memberActor, s.project.id);
    const row = listed.items.find((i) => i.id === r.id)!;
    expect(row.occurrences).toBe(2);
    expect(row.recentIssues).toHaveLength(2);
    expect(row.summary).toBe("Every Monday at 09:00");
  });

  it("deleting a produced issue does not affect the schedule (BR-2)", async () => {
    const s = await seed("rl");
    const r = await weekly(s);
    await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));
    const [made] = await issuesOf(r.id);
    await IssueService.delete(s.leadActor, made!.id);

    const after = await prisma.recurringIssue.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.active).toBe(true);
    expect(after.nextRunAt?.toISOString()).toBe("2026-03-09T09:00:00.000Z");
  });
});

describe("ending (AC-7)", () => {
  it("goes inactive after maxOccurrences", async () => {
    const s = await seed("rm");
    const r = await weekly(s, { maxOccurrences: 2 });
    await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));
    await RecurrenceService.runDue(new Date("2026-03-09T09:05:00Z"));

    const after = await prisma.recurringIssue.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.occurrences).toBe(2);
    expect(after.active).toBe(false);
    expect(after.nextRunAt).toBeNull();

    await RecurrenceService.runDue(new Date("2026-03-16T09:05:00Z"));
    expect(await issuesOf(r.id)).toHaveLength(2);
  });

  it("goes inactive once past endsOn", async () => {
    const s = await seed("rn");
    const r = await weekly(s, { endsOn: "2026-03-08T00:00:00.000Z" });
    await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));

    const after = await prisma.recurringIssue.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.active).toBe(false);
    expect(after.nextRunAt).toBeNull();
  });
});

describe("a template that cannot build a legal issue (AC-8, BR-13)", () => {
  it("records the reason and still advances", async () => {
    const s = await seed("ro");
    const r = await weekly(s, { assigneeId: s.member.id });
    // The assignee leaves the project after the recurrence was saved.
    await prisma.projectMember.deleteMany({
      where: { projectId: s.project.id, userId: s.member.id },
    });

    const tick = await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));
    expect(tick.failed).toBe(1);
    expect(await issuesOf(r.id)).toHaveLength(0);

    const after = await prisma.recurringIssue.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.lastError).toContain("member");
    // Still moving: a stuck schedule silently producing nothing is worse.
    expect(after.nextRunAt?.toISOString()).toBe("2026-03-09T09:00:00.000Z");
    expect(after.active).toBe(true);
  });

  it("clears the error once a later occurrence succeeds", async () => {
    const s = await seed("rp");
    const r = await weekly(s, { assigneeId: s.member.id });
    await prisma.projectMember.deleteMany({
      where: { projectId: s.project.id, userId: s.member.id },
    });
    await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));
    await prisma.projectMember.create({
      data: { projectId: s.project.id, userId: s.member.id, role: "MEMBER" },
    });
    await RecurrenceService.runDue(new Date("2026-03-09T09:05:00Z"));

    const after = await prisma.recurringIssue.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.lastError).toBeNull();
  });
});

describe("composing with automations (AC-11, BR-9)", () => {
  it("a recurrence-created issue trips ISSUE_CREATED rules", async () => {
    const s = await seed("rq");
    await AutomationService.create(s.leadActor, s.project.id, {
      name: "Assign the standup",
      trigger: "ISSUE_CREATED",
      enabled: true,
      conditions: [],
      actions: [{ kind: "ASSIGN", userId: s.member.id }],
    });
    const r = await weekly(s);
    await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));

    const [made] = await issuesOf(r.id);
    // "Every Monday create the standup" composes with "when a standup is
    // created, assign the rotating lead".
    expect(made!.assigneeId).toBe(s.member.id);
  });
});

describe("editing", () => {
  it("changing the schedule re-derives the next firing", async () => {
    const s = await seed("rr");
    const r = await weekly(s);
    expect(r.nextRunAt).toBe(MONDAY_9AM.toISOString());

    // Monday → Friday. Leaving the old nextRunAt would fire once more on
    // Monday and read as the edit not having saved.
    const edited = await RecurrenceService.update(
      s.leadActor,
      r.id,
      { weekdays: [5] },
      CREATED_AT,
    );
    expect(new Date(edited.nextRunAt!).getUTCDay()).toBe(5);
    expect(edited.summary).toBe("Every Friday at 09:00");
  });

  it("pausing clears the next run; resuming derives a fresh one", async () => {
    const s = await seed("rs");
    const r = await weekly(s);
    const paused = await RecurrenceService.update(
      s.leadActor,
      r.id,
      { active: false },
      CREATED_AT,
    );
    expect(paused.nextRunAt).toBeNull();

    await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));
    expect(await issuesOf(r.id)).toHaveLength(0);

    const resumed = await RecurrenceService.update(
      s.leadActor,
      r.id,
      { active: true },
      CREATED_AT,
    );
    expect(resumed.nextRunAt).not.toBeNull();
  });

  it("a soft-deleted recurrence stops immediately and keeps its issues (BR-14)", async () => {
    const s = await seed("rt");
    const r = await weekly(s);
    await RecurrenceService.runDue(new Date("2026-03-02T09:05:00Z"));
    await RecurrenceService.delete(s.leadActor, r.id);

    await RecurrenceService.runDue(new Date("2026-03-09T09:05:00Z"));
    expect(await issuesOf(r.id)).toHaveLength(1);
    expect(
      (await RecurrenceService.list(s.leadActor, s.project.id)).items,
    ).toHaveLength(0);
  });
});

describe("administration (AC-10)", () => {
  it("a MEMBER can see recurrences but not create one", async () => {
    const s = await seed("ru");
    await weekly(s);
    const seen = await RecurrenceService.list(s.memberActor, s.project.id);
    expect(seen.items).toHaveLength(1);
    expect(seen.canManage).toBe(false);
    await expect(weeklyAs(s, s.memberActor)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("an org ADMIN manages without being a project member (ADR-0024)", async () => {
    const s = await seed("rv");
    const created = await weeklyAs(s, s.adminActor);
    expect(created.name).toBe("Monday standup");
  });

  it("another organization's project is a 404, never a 403 (F-1)", async () => {
    const s = await seed("rw");
    const other = await seed("rx");
    await expect(
      RecurrenceService.list(other.leadActor, s.project.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(weeklyAs(s, other.leadActor)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("accepts a reporter who is in the org but not the project, as IssueService does", async () => {
    // Deliberately NOT project membership: an org admin can create an issue in
    // a project they are not a member of (ADR-0024), so a recurrence stricter
    // than the create path it delegates to would refuse legal schedules.
    const s = await seed("ry");
    const created = await weekly(s, { reporterId: s.outsider.id });
    expect(created.reporter.id).toBe(s.outsider.id);
  });

  it("refuses a reporter from ANOTHER organisation (F-1)", async () => {
    const s = await seed("ry2");
    const other = await seed("ry3");
    await expect(weekly(s, { reporterId: other.member.id })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("refuses an assignee who is not a project member (04_issues BR-3)", async () => {
    const s = await seed("ry4");
    await expect(weekly(s, { assigneeId: s.outsider.id })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it(`refuses recurrence ${MAX_RECURRENCES_PER_PROJECT + 1}`, async () => {
    const s = await seed("rz");
    for (let i = 0; i < MAX_RECURRENCES_PER_PROJECT; i++) {
      await weekly(s, { name: `R${i}` });
    }
    await expect(weekly(s)).rejects.toBeInstanceOf(ValidationError);
  });
});

function weeklyAs(s: Seeded, actor: Actor) {
  return RecurrenceService.create(actor, s.project.id, {
    name: "Monday standup",
    mode: "FIXED_SCHEDULE",
    frequency: "WEEKLY",
    interval: 1,
    startsOn: "2026-03-02T00:00:00.000Z",
    weekdays: [1],
    timeOfDay: 540,
    timeZone: "UTC",
    skipWeekends: false,
    skipIfOpen: false,
    title: "Run the standup",
    type: "TASK",
    priority: "MEDIUM",
  }, CREATED_AT);
}
