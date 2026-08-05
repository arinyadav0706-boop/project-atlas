import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { TeamService } from "@/features/teams/services/team.service";
import { NotFoundError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";

// Tier 4 — Teams & Hierarchy against a REAL Postgres (ADR-0031/0032). Proves the
// hierarchy traversal, manager visibility, single-team invariant, delete
// re-parenting, and tenant scope.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}
beforeEach(reset);
afterAll(() => prisma.$disconnect());

async function seed(tag: string) {
  const org = await prisma.organization.create({ data: { name: tag, domain: `${tag}.example.com` } });
  const mk = (n: string, role: "ADMIN" | "MEMBER" = "MEMBER") =>
    prisma.user.create({ data: { organizationId: org.id, email: `${n}-${tag}@x.com`, name: n, orgRole: role } });
  const admin = await mk("admin", "ADMIN");
  const mgr = await mk("mgr");
  const u1 = await mk("u1");
  const u2 = await mk("u2");
  const adminActor: Actor = { userId: admin.id, orgRole: "ADMIN", organizationId: org.id };
  const mgrActor: Actor = { userId: mgr.id, orgRole: "MEMBER", organizationId: org.id };
  return { org, admin, mgr, u1, u2, adminActor, mgrActor };
}

describe("CRUD + membership", () => {
  it("creates a team, adds a member, and lists with a count", async () => {
    const s = await seed("wa");
    const team = await TeamService.create(s.adminActor, { name: "Platform", managerId: s.mgr.id });
    await TeamService.addMember(s.adminActor, team.id, s.u1.id);

    const list = await TeamService.list(s.adminActor);
    expect(list).toHaveLength(1);
    expect(list[0]!.memberCount).toBe(1);
    expect(list[0]!.manager?.id).toBe(s.mgr.id);

    const detail = await TeamService.getDetail(s.adminActor, team.id);
    expect(detail.members.map((m) => m.userId)).toEqual([s.u1.id]);
  });

  it("moves a user when added to a second team (one team per user)", async () => {
    const s = await seed("wb");
    const a = await TeamService.create(s.adminActor, { name: "A" });
    const b = await TeamService.create(s.adminActor, { name: "B" });
    await TeamService.addMember(s.adminActor, a.id, s.u1.id);
    await TeamService.addMember(s.adminActor, b.id, s.u1.id);

    expect((await TeamService.getDetail(s.adminActor, a.id)).members).toHaveLength(0);
    expect((await TeamService.getDetail(s.adminActor, b.id)).members.map((m) => m.userId)).toEqual([s.u1.id]);
  });
});

describe("manager visibility (ADR-0032)", () => {
  it("sees members of managed team + descendants, plus self", async () => {
    const s = await seed("wc");
    const parent = await TeamService.create(s.adminActor, { name: "Parent", managerId: s.mgr.id });
    const child = await TeamService.create(s.adminActor, { name: "Child", parentTeamId: parent.id });
    await TeamService.addMember(s.adminActor, parent.id, s.u1.id);
    await TeamService.addMember(s.adminActor, child.id, s.u2.id);

    const ids = await TeamService.getManagedUserIds(s.mgrActor);
    expect([...ids].sort()).toEqual([s.mgr.id, s.u1.id, s.u2.id].sort());

    const myTeam = await TeamService.getMyTeam(s.mgrActor);
    expect(myTeam.manages).toBe(true);
    expect(myTeam.reports.map((r) => r.userId).sort()).toEqual([s.u1.id, s.u2.id].sort());
  });

  it("a non-manager sees only themselves", async () => {
    const s = await seed("wd");
    const ids = await TeamService.getManagedUserIds(s.mgrActor);
    expect([...ids]).toEqual([s.mgr.id]);
  });
});

describe("delete re-parents children and detaches members", () => {
  it("child moves to grandparent, members detached", async () => {
    const s = await seed("we");
    const parent = await TeamService.create(s.adminActor, { name: "Parent" });
    const mid = await TeamService.create(s.adminActor, { name: "Mid", parentTeamId: parent.id });
    const child = await TeamService.create(s.adminActor, { name: "Child", parentTeamId: mid.id });
    await TeamService.addMember(s.adminActor, mid.id, s.u1.id);

    await TeamService.remove(s.adminActor, mid.id);

    // child re-parented to `parent`
    const childRow = await prisma.team.findUnique({ where: { id: child.id }, select: { parentTeamId: true } });
    expect(childRow?.parentTeamId).toBe(parent.id);
    // membership detached; user can be re-added elsewhere
    const membership = await prisma.teamMembership.findFirst({ where: { userId: s.u1.id } });
    expect(membership).toBeNull();
    // team soft-deleted (not in list)
    expect((await TeamService.list(s.adminActor)).map((t) => t.id)).not.toContain(mid.id);
  });
});

describe("tenant scope (F-1)", () => {
  it("404s a team in another org", async () => {
    const s = await seed("wf");
    const other = await seed("wg");
    const team = await TeamService.create(s.adminActor, { name: "Secret" });
    await expect(TeamService.getDetail(other.adminActor, team.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});
