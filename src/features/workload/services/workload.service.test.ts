import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/workload/repositories/workload.repository", () => ({
  WorkloadRepository: {
    workingWeek: vi.fn(),
    teamsWithCounts: vi.fn(),
    findTeam: vi.fn(),
    teamMembers: vi.fn(),
    memberUserIdsByTeams: vi.fn(),
    userInOrg: vi.fn(),
    openIssuesForUsers: vi.fn(),
    loggedByIssue: vi.fn(),
    openIssuesForUserDetailed: vi.fn(),
  },
}));
vi.mock("@/features/teams/services/team.service", () => ({
  TeamService: { getManagedTeamIds: vi.fn() },
}));

import { WorkloadRepository } from "@/features/workload/repositories/workload.repository";
import { TeamService } from "@/features/teams/services/team.service";
import { WorkloadService } from "./workload.service";
import { NotFoundError } from "@/shared/lib/errors";

const repo = vi.mocked(WorkloadRepository);
const teams = vi.mocked(TeamService);

const admin: Actor = { userId: "admin-1", orgRole: "ADMIN", organizationId: "org-1" };
const manager: Actor = { userId: "mgr-1", orgRole: "MEMBER", organizationId: "org-1" };
const member: Actor = { userId: "u-9", orgRole: "MEMBER", organizationId: "org-1" };

const team = (id: string, name: string, memberships = 2) =>
  ({ id, name, _count: { memberships } }) as never;
const user = (id: string, name: string) =>
  ({ user: { id, name, email: `${id}@x.com`, avatarUrl: null } }) as never;

// Every open issue belongs to a project — the query selects it, and project
// balance (BR-16) regroups by it. Tests that are not about projects put
// everything in one.
const ALPHA = { id: "p1", key: "A", name: "Alpha" };
const BETA = { id: "p2", key: "B", name: "Beta" };

beforeEach(() => {
  vi.clearAllMocks();
  repo.workingWeek.mockResolvedValue({ workingMinutesPerDay: 480, workingDaysPerWeek: 5 } as never);
  repo.teamsWithCounts.mockResolvedValue([team("t1", "Payments")] as never);
  repo.teamMembers.mockResolvedValue([] as never);
  repo.openIssuesForUsers.mockResolvedValue([] as never);
  repo.loggedByIssue.mockResolvedValue([] as never);
  teams.getManagedTeamIds.mockResolvedValue(["t1"]);
});

describe("scope (BR-8)", () => {
  it("gives a non-manager, non-admin an empty scope rather than an error", async () => {
    teams.getManagedTeamIds.mockResolvedValue([]);
    const res = await WorkloadService.getWorkload(member);
    expect(res.teams).toEqual([]);
    expect(res.rows).toEqual([]);
    expect(res.totals.people).toBe(0);
    expect(repo.teamsWithCounts).not.toHaveBeenCalled();
  });

  it("scopes a manager to the teams they manage", async () => {
    teams.getManagedTeamIds.mockResolvedValue(["t1", "t2"]);
    await WorkloadService.getWorkload(manager);
    expect(repo.teamsWithCounts).toHaveBeenCalledWith("org-1", ["t1", "t2"]);
  });

  it("gives an org admin every team in the org (no team filter)", async () => {
    await WorkloadService.getWorkload(admin);
    expect(repo.teamsWithCounts).toHaveBeenCalledWith("org-1", undefined);
    expect(teams.getManagedTeamIds).not.toHaveBeenCalled();
  });

  it("404s a team outside the caller's scope (BR-9)", async () => {
    await expect(WorkloadService.getWorkload(manager, "other-team")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("defaults to the LARGEST team in scope, not the alphabetically first (BR-12)", async () => {
    repo.teamsWithCounts.mockResolvedValue([
      team("t1", "Core Services", 1), // sorts first, but nearly empty
      team("t2", "Mobile Squad", 17),
    ] as never);
    const res = await WorkloadService.getWorkload(manager);
    expect(res.selectedTeamId).toBe("t2");
  });

  it("still honours an explicitly requested team", async () => {
    repo.teamsWithCounts.mockResolvedValue([
      team("t1", "Core Services", 1),
      team("t2", "Mobile Squad", 17),
    ] as never);
    const res = await WorkloadService.getWorkload(manager, "t1");
    expect(res.selectedTeamId).toBe("t1");
  });
});

describe("aggregation (BR-1..BR-6)", () => {
  beforeEach(() => {
    repo.teamMembers.mockResolvedValue([user("u1", "Ana"), user("u2", "Bo")] as never);
  });

  it("computes remaining effort net of logged time, per person", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      { id: "i1", assigneeId: "u1", estimateMinutes: 480, project: ALPHA },
      { id: "i2", assigneeId: "u1", estimateMinutes: 120, project: ALPHA },
      { id: "i3", assigneeId: "u2", estimateMinutes: 60, project: ALPHA },
    ] as never);
    repo.loggedByIssue.mockResolvedValue([
      { issueId: "i1", _sum: { minutes: 180 } },
    ] as never);

    const res = await WorkloadService.getWorkload(manager);
    const ana = res.rows.find((r) => r.userId === "u1")!;
    const bo = res.rows.find((r) => r.userId === "u2")!;

    expect(ana.remainingMinutes).toBe(420); // (480-180) + 120
    expect(ana.estimatedMinutes).toBe(600);
    expect(ana.loggedMinutes).toBe(180);
    expect(ana.openIssues).toBe(2);
    expect(bo.remainingMinutes).toBe(60);
  });

  it("counts unestimated issues without inventing effort (BR-4)", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      { id: "i1", assigneeId: "u1", estimateMinutes: null, project: ALPHA },
      { id: "i2", assigneeId: "u1", estimateMinutes: null, project: ALPHA },
    ] as never);

    const res = await WorkloadService.getWorkload(manager);
    const ana = res.rows.find((r) => r.userId === "u1")!;
    expect(ana.openIssues).toBe(2);
    expect(ana.unestimated).toBe(2);
    expect(ana.remainingMinutes).toBe(0);
    expect(ana.status).toBe("LIGHT"); // open work, but nothing measurable — not idle
  });

  it("clamps an overrun to zero rather than crediting negative load", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      { id: "i1", assigneeId: "u1", estimateMinutes: 60, project: ALPHA },
    ] as never);
    repo.loggedByIssue.mockResolvedValue([
      { issueId: "i1", _sum: { minutes: 600 } },
    ] as never);

    const res = await WorkloadService.getWorkload(manager);
    expect(res.rows.find((r) => r.userId === "u1")!.remainingMinutes).toBe(0);
  });

  it("reports a member with no open issues as IDLE", async () => {
    const res = await WorkloadService.getWorkload(manager);
    expect(res.rows.every((r) => r.status === "IDLE")).toBe(true);
    expect(res.totals.idle).toBe(2);
  });

  it("sorts most-loaded first and totals the team (BR-10)", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      { id: "i1", assigneeId: "u2", estimateMinutes: 6000, project: ALPHA },
      { id: "i2", assigneeId: "u1", estimateMinutes: 60, project: ALPHA },
    ] as never);

    const res = await WorkloadService.getWorkload(manager);
    expect(res.rows.map((r) => r.userId)).toEqual(["u2", "u1"]);
    expect(res.totals.openIssues).toBe(2);
    expect(res.totals.remainingMinutes).toBe(6060);
    expect(res.totals.overloaded).toBe(1); // 6000m = 2.5 weeks
  });

  it("skips the work-log query entirely when the team has no open issues", async () => {
    await WorkloadService.getWorkload(manager);
    expect(repo.loggedByIssue).not.toHaveBeenCalled();
  });
});

// ── Project balance (BR-16) ─────────────────────────────────────────────────
// A regrouping of the same issues, so the tests that matter are the ones that
// pin it to the rows: the same effort, split a different way.

describe("project balance (BR-16)", () => {
  beforeEach(() => {
    repo.teamMembers.mockResolvedValue([user("u1", "Ana"), user("u2", "Bo")] as never);
  });

  it("regroups the same effort by project without inventing or losing any", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      { id: "i1", assigneeId: "u1", estimateMinutes: 600, project: ALPHA },
      { id: "i2", assigneeId: "u2", estimateMinutes: 300, project: ALPHA },
      { id: "i3", assigneeId: "u1", estimateMinutes: 120, project: BETA },
    ] as never);
    repo.loggedByIssue.mockResolvedValue([{ issueId: "i1", _sum: { minutes: 100 } }] as never);

    const res = await WorkloadService.getWorkload(manager);

    const summed = res.projects.reduce((n, p) => n + p.remainingMinutes, 0);
    expect(summed).toBe(res.totals.remainingMinutes);
    // And each project's segments sum to that project (acceptance 19).
    for (const project of res.projects) {
      expect(project.segments.reduce((n, s) => n + s.minutes, 0)).toBe(project.remainingMinutes);
    }
  });

  it("sorts by remaining effort, heaviest project first", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      { id: "i1", assigneeId: "u1", estimateMinutes: 120, project: ALPHA },
      { id: "i2", assigneeId: "u2", estimateMinutes: 900, project: BETA },
    ] as never);

    const res = await WorkloadService.getWorkload(manager);
    expect(res.projects.map((p) => p.key)).toEqual(["B", "A"]);
  });

  it("counts distinct people per project and spreads the queue across them", async () => {
    // 4800 minutes in Alpha across two people = 2400 each = exactly one week.
    repo.openIssuesForUsers.mockResolvedValue([
      { id: "i1", assigneeId: "u1", estimateMinutes: 2400, project: ALPHA },
      { id: "i2", assigneeId: "u2", estimateMinutes: 2400, project: ALPHA },
      { id: "i3", assigneeId: "u1", estimateMinutes: 480, project: BETA },
    ] as never);

    const res = await WorkloadService.getWorkload(manager);
    const alpha = res.projects.find((p) => p.key === "A")!;
    const beta = res.projects.find((p) => p.key === "B")!;

    expect(alpha.people).toBe(2);
    expect(alpha.weeksPerPerson).toBe(1);
    expect(beta.people).toBe(1);
    expect(beta.weeksPerPerson).toBe(0.2); // 480 / 2400
  });

  // Acceptance 20 — the mirror of BR-4. A project must not disappear because
  // nobody has estimated its work; that is precisely the blind spot the
  // coverage banner exists to warn about.
  it("keeps a project whose open work is entirely unestimated", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      { id: "i1", assigneeId: "u1", estimateMinutes: 600, project: ALPHA },
      { id: "i2", assigneeId: "u2", estimateMinutes: null, project: BETA },
      { id: "i3", assigneeId: "u2", estimateMinutes: null, project: BETA },
    ] as never);

    const res = await WorkloadService.getWorkload(manager);
    const beta = res.projects.find((p) => p.key === "B")!;

    expect(beta.remainingMinutes).toBe(0);
    expect(beta.openIssues).toBe(2);
    expect(beta.unestimated).toBe(2);
    // Still counted as a person on the project, so the divisor is honest.
    expect(beta.people).toBe(1);
    expect(beta.weeksPerPerson).toBe(0);
  });

  it("labels each segment with the person's team-wide band, not a per-project one", async () => {
    // Bo is overloaded overall (6000m = 2.5 wk), but holds only a sliver here.
    repo.openIssuesForUsers.mockResolvedValue([
      { id: "i1", assigneeId: "u2", estimateMinutes: 5940, project: BETA },
      { id: "i2", assigneeId: "u2", estimateMinutes: 60, project: ALPHA },
      { id: "i3", assigneeId: "u1", estimateMinutes: 60, project: ALPHA },
    ] as never);

    const res = await WorkloadService.getWorkload(manager);
    const alpha = res.projects.find((p) => p.key === "A")!;
    const bo = alpha.segments.find((s) => s.userId === "u2")!;

    expect(bo.status).toBe("OVERLOADED");
    expect(bo.minutes).toBe(60);
  });

  it("is empty when the team has no open work at all", async () => {
    const res = await WorkloadService.getWorkload(manager);
    expect(res.projects).toEqual([]);
  });
});

describe("the organization's working week drives the bands (ADR-0034 amendment)", () => {
  beforeEach(() => {
    repo.teamMembers.mockResolvedValue([user("u1", "Ana")] as never);
    // 6000 minutes = 100 hours queued.
    repo.openIssuesForUsers.mockResolvedValue([
      { id: "i1", assigneeId: "u1", estimateMinutes: 6000, project: ALPHA },
    ] as never);
  });

  it("calls 100h overloaded at a 40-hour week", async () => {
    const res = await WorkloadService.getWorkload(manager);
    expect(res.rows[0]!.weeksOfWork).toBe(2.5);
    expect(res.rows[0]!.status).toBe("OVERLOADED");
    expect(res.workingWeek.label).toBe("8h × 5 days = 40h week");
  });

  it("calls the SAME 100h balanced at a 6-day, 8-hour company", async () => {
    repo.workingWeek.mockResolvedValue({
      workingMinutesPerDay: 480,
      workingDaysPerWeek: 6,
    } as never);
    const res = await WorkloadService.getWorkload(manager);
    expect(res.rows[0]!.weeksOfWork).toBe(2.1); // 6000 / 2880
    expect(res.workingWeek.weeklyMinutes).toBe(2880);
  });

  it("reports a 9-hour, 5-day week", async () => {
    repo.workingWeek.mockResolvedValue({
      workingMinutesPerDay: 540,
      workingDaysPerWeek: 5,
    } as never);
    const res = await WorkloadService.getWorkload(manager);
    expect(res.workingWeek.label).toBe("9h × 5 days = 45h week");
    expect(res.rows[0]!.weeksOfWork).toBe(2.2); // 6000 / 2700
  });

  it("falls back to a 40-hour week when the org row is unreadable", async () => {
    repo.workingWeek.mockResolvedValue(null as never);
    const res = await WorkloadService.getWorkload(manager);
    expect(res.workingWeek.weeklyMinutes).toBe(2400);
  });
});

describe("drill-in scope (BR-11)", () => {
  beforeEach(() => {
    repo.userInOrg.mockResolvedValue({ id: "u1" } as never);
    repo.memberUserIdsByTeams.mockResolvedValue([{ userId: "u1" }] as never);
    repo.openIssuesForUserDetailed.mockResolvedValue([] as never);
  });

  it("allows a manager to see a person inside their scope", async () => {
    await expect(WorkloadService.getUserIssues(manager, "u1")).resolves.toEqual([]);
  });

  it("404s a person outside the manager's scope", async () => {
    repo.memberUserIdsByTeams.mockResolvedValue([{ userId: "someone-else" }] as never);
    await expect(WorkloadService.getUserIssues(manager, "u1")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404s a person in another organization even for an admin (F-1)", async () => {
    repo.userInOrg.mockResolvedValue(null as never);
    await expect(WorkloadService.getUserIssues(admin, "outsider")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("lets anyone see their own work without a team", async () => {
    teams.getManagedTeamIds.mockResolvedValue([]);
    await expect(WorkloadService.getUserIssues(member, member.userId)).resolves.toEqual([]);
    expect(repo.userInOrg).not.toHaveBeenCalled();
  });

  it("orders issues by remaining effort, most first", async () => {
    repo.openIssuesForUserDetailed.mockResolvedValue([
      {
        id: "i1", key: "A-1", title: "small", type: "TASK", status: "TODO", priority: "LOW",
        dueDate: null, estimateMinutes: 60, project: { id: "p1", key: "A", name: "Alpha" },
      },
      {
        id: "i2", key: "A-2", title: "big", type: "TASK", status: "TODO", priority: "LOW",
        dueDate: null, estimateMinutes: 900, project: { id: "p1", key: "A", name: "Alpha" },
      },
    ] as never);
    repo.loggedByIssue.mockResolvedValue([] as never);

    const res = await WorkloadService.getUserIssues(manager, "u1");
    expect(res.map((i) => i.key)).toEqual(["A-2", "A-1"]);
    expect(res[0]!.remainingMinutes).toBe(900);
  });
});

// ── The time-phased grid (ADR-0035) ─────────────────────────────────────────
// The chain and the spreading maths are covered in features/scheduling; these
// pin the wiring: which column an issue lands in, that inference is marked, and
// the invariant that the grid never invents or drops a minute.

describe("time-phased grid (BR-13, ADR-0035)", () => {
  // A Thursday. Horizon: Aug 3–7, Aug 10–14, Aug 17–21, Aug 24–28.
  const NOW = new Date("2026-08-06T09:00:00.000Z");
  const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const issue = (over: Record<string, unknown>) => ({
    assigneeId: "u1",
    estimateMinutes: null,
    dueDate: null,
    sprint: null,
    project: ALPHA,
    ...over,
  });

  beforeEach(() => {
    repo.teamMembers.mockResolvedValue([user("u1", "Ana")] as never);
  });

  const gridRow = async () => {
    const res = await WorkloadService.getWorkload(manager, undefined, NOW);
    return { grid: res.grid, row: res.grid.rows.find((r) => r.userId === "u1")!, res };
  };

  it("labels columns with real dates, not '+2 wk'", async () => {
    const { grid } = await gridRow();
    expect(grid.weeks.map((w) => w.label)).toEqual([
      "Aug 3–7",
      "Aug 10–14",
      "Aug 17–21",
      "Aug 24–28",
    ]);
    expect(grid.weeks.filter((w) => w.isCurrent)).toHaveLength(1);
    expect(grid.weeks[0]!.isCurrent).toBe(true);
  });

  it("spreads a due date across the weeks from today, rather than spiking in the due week", async () => {
    // Due Fri 21 Aug: 12 working days from today, so the effort reaches three
    // columns instead of landing entirely in the third.
    repo.openIssuesForUsers.mockResolvedValue([
      issue({ id: "i1", estimateMinutes: 1200, dueDate: utc("2026-08-21") }),
    ] as never);

    const { row } = await gridRow();
    expect(row.weeks.map((w) => w.minutes)).toEqual([200, 500, 500, 0]);
    expect(row.weeks.every((w) => !w.inferred)).toBe(true);
  });

  it("falls back to the sprint window and marks the cells as inferred", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      issue({
        id: "i1",
        estimateMinutes: 1000,
        sprint: { startDate: utc("2026-08-03"), endDate: utc("2026-08-14") },
      }),
    ] as never);

    const { grid, row } = await gridRow();
    // The sprint started Monday but three of its days have gone: today through
    // Friday is 2 days, next week 5.
    expect(row.weeks.map((w) => w.minutes)).toEqual([286, 714, 0, 0]);
    expect(row.weeks[0]!.inferred).toBe(true);
    expect(grid.hasInferred).toBe(true);
  });

  it("prefers the issue's own due date over its sprint's window", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      issue({
        id: "i1",
        estimateMinutes: 600,
        dueDate: utc("2026-08-07"),
        sprint: { startDate: utc("2026-08-03"), endDate: utc("2026-08-28") },
      }),
    ] as never);

    const { row } = await gridRow();
    expect(row.weeks.map((w) => w.minutes)).toEqual([600, 0, 0, 0]);
    expect(row.weeks[0]!.inferred).toBe(false);
  });

  it("puts a missed due date in Overdue and shows the column", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      issue({ id: "i1", estimateMinutes: 300, dueDate: utc("2026-07-30") }),
    ] as never);

    const { grid, row } = await gridRow();
    expect(row.overdue.minutes).toBe(300);
    expect(row.weeks.every((w) => w.minutes === 0)).toBe(true);
    expect(grid.hasOverdue).toBe(true);
  });

  it("hides the Overdue column when nothing is late", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      issue({ id: "i1", estimateMinutes: 300, dueDate: utc("2026-08-14") }),
    ] as never);

    const { grid } = await gridRow();
    expect(grid.hasOverdue).toBe(false);
  });

  it("carries effort past the horizon into Later instead of dropping it", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      issue({ id: "i1", estimateMinutes: 1000, dueDate: utc("2026-11-30") }),
    ] as never);

    const { grid, row } = await gridRow();
    expect(row.later.minutes).toBeGreaterThan(0);
    expect(grid.hasLater).toBe(true);
  });

  it("puts work with no dates anywhere in Unscheduled, with no percentage", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      issue({ id: "i1", estimateMinutes: 900 }),
    ] as never);

    const { grid, row } = await gridRow();
    expect(row.unscheduledMinutes).toBe(900);
    expect(row.weeks.every((w) => w.minutes === 0)).toBe(true);
    expect(grid.hasOverdue).toBe(false);
    expect(grid.hasLater).toBe(false);
  });

  it("colours by share of the person's own weekly capacity", async () => {
    // A full 40-hour week due this Friday.
    repo.openIssuesForUsers.mockResolvedValue([
      issue({ id: "i1", estimateMinutes: 2400, dueDate: utc("2026-08-07") }),
    ] as never);

    const { grid, row } = await gridRow();
    expect(grid.weeklyCapacityMinutes).toBe(2400);
    expect(row.weeks[0]!.percentOfCapacity).toBe(100);
  });

  it("rescales those percentages for a six-day company", async () => {
    repo.workingWeek.mockResolvedValue({
      workingMinutesPerDay: 480,
      workingDaysPerWeek: 6,
    } as never);
    repo.openIssuesForUsers.mockResolvedValue([
      issue({ id: "i1", estimateMinutes: 2400, dueDate: utc("2026-08-07") }),
    ] as never);

    const { row } = await gridRow();
    expect(row.weeks[0]!.percentOfCapacity).toBe(83); // 2400 of a 2880-minute week
  });

  it("never invents or drops a minute — the row sums to the list's number", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      issue({ id: "i1", estimateMinutes: 1234, dueDate: utc("2026-08-21") }),
      issue({ id: "i2", estimateMinutes: 777, dueDate: utc("2026-07-01") }),
      issue({ id: "i3", estimateMinutes: 999 }),
      issue({ id: "i4", estimateMinutes: 5000, dueDate: utc("2027-01-15") }),
      issue({
        id: "i5",
        estimateMinutes: 640,
        sprint: { startDate: utc("2026-08-10"), endDate: utc("2026-08-21") },
      }),
      issue({ id: "i6", estimateMinutes: null, dueDate: utc("2026-08-12") }),
    ] as never);
    repo.loggedByIssue.mockResolvedValue([{ issueId: "i1", _sum: { minutes: 34 } }] as never);

    const { row, res } = await gridRow();
    const cells =
      row.overdue.minutes +
      row.weeks.reduce((a, w) => a + w.minutes, 0) +
      row.later.minutes +
      row.unscheduledMinutes;

    expect(cells).toBe(row.totalMinutes);
    expect(row.totalMinutes).toBe(res.rows.find((r) => r.userId === "u1")!.remainingMinutes);
    expect(row.totalMinutes).toBe(1200 + 777 + 999 + 5000 + 640);
  });

  it("keeps the grid in the same order as the list, so the toggle doesn't shuffle", async () => {
    repo.teamMembers.mockResolvedValue([user("u1", "Ana"), user("u2", "Bo")] as never);
    repo.openIssuesForUsers.mockResolvedValue([
      issue({ id: "i1", assigneeId: "u1", estimateMinutes: 60 }),
      issue({ id: "i2", assigneeId: "u2", estimateMinutes: 6000 }),
    ] as never);

    const res = await WorkloadService.getWorkload(manager, undefined, NOW);
    expect(res.grid.rows.map((r) => r.userId)).toEqual(res.rows.map((r) => r.userId));
    expect(res.grid.rows.map((r) => r.userId)).toEqual(["u2", "u1"]);
  });

  it("still returns week columns for a team with no members", async () => {
    repo.teamMembers.mockResolvedValue([] as never);
    const res = await WorkloadService.getWorkload(manager, undefined, NOW);
    expect(res.grid.weeks).toHaveLength(4);
    expect(res.grid.rows).toEqual([]);
  });
});
