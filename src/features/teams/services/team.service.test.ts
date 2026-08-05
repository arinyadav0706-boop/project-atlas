import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/shared/types/actor";

vi.mock("@/features/teams/repositories/team.repository", () => ({
  TeamRepository: {
    listByOrg: vi.fn(),
    hierarchyRows: vi.fn(),
    findById: vi.fn(),
    findDetail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteWithReparent: vi.fn(),
    membershipsByTeamIds: vi.fn(),
    addMember: vi.fn(),
    removeMember: vi.fn(),
    reportsByUserIds: vi.fn(),
    userInOrg: vi.fn(),
    orgUsers: vi.fn(),
    managesAnyTeam: vi.fn(),
  },
}));
vi.mock("@/features/admin/services/audit-log.service", () => ({
  AuditLogService: { record: vi.fn() },
}));

import { TeamRepository } from "@/features/teams/repositories/team.repository";
import { TeamService } from "./team.service";
import { ForbiddenError, ValidationError } from "@/shared/lib/errors";

const repo = vi.mocked(TeamRepository);
const admin: Actor = { userId: "admin-1", orgRole: "ADMIN", organizationId: "org-1" };
const member: Actor = { userId: "u-1", orgRole: "MEMBER", organizationId: "org-1" };

beforeEach(() => {
  vi.clearAllMocks();
  repo.userInOrg.mockResolvedValue({ id: "x" } as never);
  repo.findById.mockResolvedValue({
    id: "t1",
    organizationId: "org-1",
    name: "T1",
    managerId: null,
    parentTeamId: null,
  } as never);
});

describe("RBAC", () => {
  it("forbids a non-admin (no MANAGE_TEAMS) from creating", async () => {
    await expect(TeamService.create(member, { name: "X" })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets an admin create a team", async () => {
    repo.create.mockResolvedValue({ id: "t9" } as never);
    const res = await TeamService.create(admin, { name: "Platform" });
    expect(res.id).toBe("t9");
  });

  it("rejects a cross-org manager", async () => {
    repo.userInOrg.mockResolvedValue(null as never);
    await expect(
      TeamService.create(admin, { name: "X", managerId: "outsider" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("hierarchy integrity", () => {
  it("rejects a parent that would create a cycle", async () => {
    // t1 -> parent t2, and t2 -> parent t1 already: setting t1.parent=t2 cycles.
    repo.hierarchyRows.mockResolvedValue([
      { id: "t1", parentTeamId: null, managerId: null },
      { id: "t2", parentTeamId: "t1", managerId: null },
    ] as never);
    repo.findById.mockResolvedValue({
      id: "t1",
      organizationId: "org-1",
      name: "T1",
      managerId: null,
      parentTeamId: null,
    } as never);
    await expect(
      TeamService.update(admin, "t1", { parentTeamId: "t2" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a team being its own parent", async () => {
    await expect(
      TeamService.update(admin, "t1", { parentTeamId: "t1" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("getManagedUserIds (manager visibility, ADR-0032)", () => {
  it("includes members of managed teams and all descendants, plus the manager", async () => {
    // mgr manages t1; t2 is a child of t1; t3 is unrelated (other manager).
    repo.hierarchyRows.mockResolvedValue([
      { id: "t1", parentTeamId: null, managerId: "mgr" },
      { id: "t2", parentTeamId: "t1", managerId: null },
      { id: "t3", parentTeamId: null, managerId: "other" },
    ] as never);
    repo.membershipsByTeamIds.mockResolvedValue([
      { userId: "u1" },
      { userId: "u2" },
    ] as never);

    const mgr: Actor = { userId: "mgr", orgRole: "MEMBER", organizationId: "org-1" };
    const ids = await TeamService.getManagedUserIds(mgr);

    expect(repo.membershipsByTeamIds).toHaveBeenCalledWith(
      expect.arrayContaining(["t1", "t2"]),
    );
    expect([...ids].sort()).toEqual(["mgr", "u1", "u2"]);
    // t3 (unrelated) never queried
    expect(repo.membershipsByTeamIds.mock.calls[0]![0]).not.toContain("t3");
  });

  it("returns only the actor when they manage nothing", async () => {
    repo.hierarchyRows.mockResolvedValue([
      { id: "t1", parentTeamId: null, managerId: "someone-else" },
    ] as never);
    const ids = await TeamService.getManagedUserIds(member);
    expect([...ids]).toEqual(["u-1"]);
    expect(repo.membershipsByTeamIds).not.toHaveBeenCalled();
  });
});

describe("getMyTeam", () => {
  it("lists reports (managed users minus self) with team names", async () => {
    repo.hierarchyRows.mockResolvedValue([
      { id: "t1", parentTeamId: null, managerId: "mgr" },
    ] as never);
    repo.membershipsByTeamIds.mockResolvedValue([{ userId: "u1" }] as never);
    repo.reportsByUserIds.mockResolvedValue([
      { user: { id: "u1", name: "Ana", email: "a@x.com", avatarUrl: null }, team: { name: "T1" } },
    ] as never);
    const mgr: Actor = { userId: "mgr", orgRole: "MEMBER", organizationId: "org-1" };
    const res = await TeamService.getMyTeam(mgr);
    expect(res.manages).toBe(true);
    expect(res.reports).toEqual([
      { userId: "u1", name: "Ana", email: "a@x.com", avatarUrl: null, teamName: "T1" },
    ]);
  });

  it("manages=false when the actor manages no team", async () => {
    repo.hierarchyRows.mockResolvedValue([] as never);
    const res = await TeamService.getMyTeam(member);
    expect(res).toEqual({ manages: false, reports: [] });
  });
});
