import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/workload/repositories/workload.repository", () => ({
  WorkloadRepository: {
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

beforeEach(() => {
  vi.clearAllMocks();
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

  it("defaults to the first team in scope when none is given", async () => {
    repo.teamsWithCounts.mockResolvedValue([team("t1", "Alpha"), team("t2", "Beta")] as never);
    const res = await WorkloadService.getWorkload(manager);
    expect(res.selectedTeamId).toBe("t1");
  });
});

describe("aggregation (BR-1..BR-6)", () => {
  beforeEach(() => {
    repo.teamMembers.mockResolvedValue([user("u1", "Ana"), user("u2", "Bo")] as never);
  });

  it("computes remaining effort net of logged time, per person", async () => {
    repo.openIssuesForUsers.mockResolvedValue([
      { id: "i1", assigneeId: "u1", estimateMinutes: 480 },
      { id: "i2", assigneeId: "u1", estimateMinutes: 120 },
      { id: "i3", assigneeId: "u2", estimateMinutes: 60 },
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
      { id: "i1", assigneeId: "u1", estimateMinutes: null },
      { id: "i2", assigneeId: "u1", estimateMinutes: null },
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
      { id: "i1", assigneeId: "u1", estimateMinutes: 60 },
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
      { id: "i1", assigneeId: "u2", estimateMinutes: 6000 },
      { id: "i2", assigneeId: "u1", estimateMinutes: 60 },
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
