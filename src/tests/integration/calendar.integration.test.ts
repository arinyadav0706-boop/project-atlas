import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { CalendarService } from "@/features/calendar/services/calendar.service";
import { TimelineService } from "@/features/timeline/services/timeline.service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Tier 4 — Calendar against a REAL Postgres (ADR-0048).
//
// This file exists because the Timeline shipped WITHOUT it. Its permission
// wiring was correct by inspection and pinned by nothing, so a later edit could
// have dropped the `canWriteContent` gate and every test would still have
// passed. The Calendar shares the Timeline's write path, so the schedule cases
// below cover both — and the RBAC matrix I said was missing is now here.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}
beforeEach(reset);
afterAll(() => prisma.$disconnect());

let rankSeq = 0;
const nextRank = () => `r${(rankSeq++).toString().padStart(5, "0")}`;

const WINDOW = { from: "2026-08-01", to: "2026-08-31" };

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
  const stranger = await mk("stranger"); // same org, NOT on the project

  const project = await prisma.project.create({
    data: { organizationId: org.id, key: `P${tag}`, name: "Project" },
  });
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: lead.id, role: "LEAD" },
      { projectId: project.id, userId: member.id, role: "MEMBER" },
      { projectId: project.id, userId: viewer.id, role: "VIEWER" },
    ],
  });

  const issue = (opts: {
    key: string;
    startDate?: string | null;
    dueDate?: string | null;
    status?: "TODO" | "DONE";
  }) =>
    prisma.issue.create({
      data: {
        projectId: project.id,
        key: opts.key,
        type: "TASK",
        title: opts.key,
        status: opts.status ?? "TODO",
        priority: "MEDIUM",
        reporterId: admin.id,
        rank: nextRank(),
        startDate: opts.startDate ? new Date(`${opts.startDate}T00:00:00Z`) : null,
        dueDate: opts.dueDate ? new Date(`${opts.dueDate}T00:00:00Z`) : null,
      },
    });

  const actor = (u: { id: string }, orgRole: "ADMIN" | "MEMBER" = "MEMBER"): Actor => ({
    userId: u.id,
    orgRole,
    organizationId: org.id,
  });

  return {
    org,
    project,
    issue,
    adminActor: actor(admin, "ADMIN"),
    leadActor: actor(lead),
    memberActor: actor(member),
    viewerActor: actor(viewer),
    strangerActor: actor(stranger),
  };
}

describe("what the calendar returns (BR-1, BR-2)", () => {
  it("includes an issue whose span touches the window, and excludes one that does not", async () => {
    const s = await seed("ca");
    await s.issue({ key: "IN-1", dueDate: "2026-08-14" });
    await s.issue({ key: "IN-2", startDate: "2026-07-28", dueDate: "2026-08-02" });
    await s.issue({ key: "OUT-1", dueDate: "2026-06-01" });
    await s.issue({ key: "OUT-2", dueDate: "2026-10-01" });

    const res = await CalendarService.get(s.leadActor, s.project.id, WINDOW, {});
    expect(res.events.map((e) => e.key).sort()).toEqual(["IN-1", "IN-2"]);
  });

  it("finds a due-date-only issue inside the window", async () => {
    // The overlap test has to be written against the EFFECTIVE start
    // (`startDate ?? dueDate`). A naive `startDate <= to` predicate misses
    // every issue with no start — which is most real data.
    const s = await seed("cb");
    await s.issue({ key: "NOSTART", startDate: null, dueDate: "2026-08-14" });
    const res = await CalendarService.get(s.leadActor, s.project.id, WINDOW, {});
    expect(res.events.map((e) => e.key)).toEqual(["NOSTART"]);
  });

  it("puts an undated issue in the panel, never on a day", async () => {
    const s = await seed("cc");
    await s.issue({ key: "UNDATED" });
    const res = await CalendarService.get(s.leadActor, s.project.id, WINDOW, {});
    expect(res.events).toHaveLength(0);
    expect(res.unscheduled.map((e) => e.key)).toEqual(["UNDATED"]);
  });

  it("sends days, not instants, on the wire (BR-11)", async () => {
    const s = await seed("cd");
    await s.issue({ key: "D-1", startDate: "2026-08-10", dueDate: "2026-08-14" });
    const res = await CalendarService.get(s.leadActor, s.project.id, WINDOW, {});
    expect(res.events[0]).toMatchObject({ startDate: "2026-08-10", dueDate: "2026-08-14" });
  });

  it("narrows with the shared issue filter", async () => {
    const s = await seed("ce");
    await s.issue({ key: "OPEN-1", dueDate: "2026-08-14" });
    await s.issue({ key: "DONE-1", dueDate: "2026-08-15", status: "DONE" });

    const all = await CalendarService.get(s.leadActor, s.project.id, WINDOW, {});
    expect(all.events).toHaveLength(2);

    const open = await CalendarService.get(s.leadActor, s.project.id, WINDOW, {
      openOnly: true,
    });
    expect(open.events.map((e) => e.key)).toEqual(["OPEN-1"]);
  });
});

// BR-9 — the matrix. This is the part the Timeline shipped without.
describe("who can see it, and who can change it", () => {
  it("shows the calendar to every role in the org, including a non-member", async () => {
    const s = await seed("cf");
    await s.issue({ key: "X-1", dueDate: "2026-08-14" });
    for (const actor of [s.adminActor, s.leadActor, s.memberActor, s.viewerActor, s.strangerActor]) {
      const res = await CalendarService.get(actor, s.project.id, WINDOW, {});
      expect(res.events).toHaveLength(1);
    }
  });

  it("lets only MEMBER, LEAD and org ADMIN drag — canEdit says so honestly", async () => {
    const s = await seed("cg");
    const can = async (actor: Actor) =>
      (await CalendarService.get(actor, s.project.id, WINDOW, {})).canEdit;

    expect(await can(s.adminActor)).toBe(true); // elevated to LEAD (ADR-0024)
    expect(await can(s.leadActor)).toBe(true);
    expect(await can(s.memberActor)).toBe(true);
    expect(await can(s.viewerActor)).toBe(false);
    expect(await can(s.strangerActor)).toBe(false);
  });

  it("refuses a VIEWER's reschedule server-side, not just in the UI", async () => {
    // `canEdit: false` hides the drag. It is not the boundary — this is.
    const s = await seed("ch");
    const i = await s.issue({ key: "X-1", dueDate: "2026-08-14" });
    await expect(
      TimelineService.schedule(s.viewerActor, i.id, {
        dueDate: "2026-08-20",
        expectedVersion: i.version,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a same-org non-member's reschedule too", async () => {
    const s = await seed("ci");
    const i = await s.issue({ key: "X-1", dueDate: "2026-08-14" });
    await expect(
      TimelineService.schedule(s.strangerActor, i.id, {
        dueDate: "2026-08-20",
        expectedVersion: i.version,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets a MEMBER reschedule, and the change sticks", async () => {
    const s = await seed("cj");
    const i = await s.issue({ key: "X-1", startDate: "2026-08-10", dueDate: "2026-08-14" });
    const row = await TimelineService.schedule(s.memberActor, i.id, {
      startDate: "2026-08-17",
      dueDate: "2026-08-21",
      expectedVersion: i.version,
    });
    expect(row).toMatchObject({ startDate: "2026-08-17", dueDate: "2026-08-21" });

    const res = await CalendarService.get(s.memberActor, s.project.id, WINDOW, {});
    expect(res.events[0]).toMatchObject({ startDate: "2026-08-17", dueDate: "2026-08-21" });
  });

  // F-1 — a project in another org is ABSENT, not forbidden. A 403 would
  // confirm it exists.
  it("404s a project in another organization, for read and for write", async () => {
    const a = await seed("ck");
    const b = await seed("cl");
    const i = await a.issue({ key: "X-1", dueDate: "2026-08-14" });

    await expect(
      CalendarService.get(b.adminActor, a.project.id, WINDOW, {}),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      TimelineService.schedule(b.adminActor, i.id, {
        dueDate: "2026-08-20",
        expectedVersion: i.version,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// BR-8 — the shared write path's rules, which the Calendar inherits rather
// than re-implements.
describe("the rules a drag inherits", () => {
  it("409s a stale version instead of overwriting someone else's move", async () => {
    const s = await seed("cm");
    const i = await s.issue({ key: "X-1", dueDate: "2026-08-14" });
    await TimelineService.schedule(s.leadActor, i.id, {
      dueDate: "2026-08-15",
      expectedVersion: i.version,
    });
    await expect(
      TimelineService.schedule(s.memberActor, i.id, {
        dueDate: "2026-08-16",
        expectedVersion: i.version, // the version they loaded, now stale
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a start after its due date, against the EFFECTIVE pair", async () => {
    const s = await seed("cn");
    const i = await s.issue({ key: "X-1", startDate: "2026-08-10", dueDate: "2026-08-14" });
    // Sending only a start that lands after the STORED due date is the same
    // illegal state as sending both.
    await expect(
      TimelineService.schedule(s.leadActor, i.id, {
        startDate: "2026-08-20",
        expectedVersion: i.version,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("is read-only on an archived project", async () => {
    const s = await seed("co");
    const i = await s.issue({ key: "X-1", dueDate: "2026-08-14" });
    await prisma.project.update({
      where: { id: s.project.id },
      data: { status: "ARCHIVED" },
    });
    await expect(
      TimelineService.schedule(s.leadActor, i.id, {
        dueDate: "2026-08-20",
        expectedVersion: i.version,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
    // Still readable, though — an archive you cannot look at is a deletion.
    const res = await CalendarService.get(s.leadActor, s.project.id, WINDOW, {});
    expect(res.events).toHaveLength(1);
    expect(res.canEdit).toBe(true); // the role permits it; the project's state does not
  });
});

describe("the window itself", () => {
  it("echoes the window it actually queried", async () => {
    const s = await seed("cp");
    const res = await CalendarService.get(s.leadActor, s.project.id, WINDOW, {});
    expect(res).toMatchObject({ from: WINDOW.from, to: WINDOW.to });
  });

  it("does not leak another project's issues into the window", async () => {
    const s = await seed("cq");
    const other = await prisma.project.create({
      data: { organizationId: s.org.id, key: "OTHER", name: "Other" },
    });
    await prisma.issue.create({
      data: {
        projectId: other.id,
        key: "OTHER-1",
        type: "TASK",
        title: "OTHER-1",
        status: "TODO",
        priority: "MEDIUM",
        reporterId: s.adminActor.userId,
        rank: nextRank(),
        dueDate: new Date("2026-08-14T00:00:00Z"),
      },
    });
    await s.issue({ key: "MINE-1", dueDate: "2026-08-14" });

    const res = await CalendarService.get(s.leadActor, s.project.id, WINDOW, {});
    expect(res.events.map((e) => e.key)).toEqual(["MINE-1"]);
  });
});
