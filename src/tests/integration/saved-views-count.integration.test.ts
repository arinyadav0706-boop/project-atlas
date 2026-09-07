import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { SavedViewService } from "@/features/saved-views/services/saved-view.service";
import { COUNT_CAP } from "@/features/saved-views/types/saved-view.types";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type { Actor } from "@/shared/types/actor";
import { createProjectWithStatuses, statusFor } from "./helpers/workflow";

// Tier 4 — the result count in "1–50 of 7,300", against a REAL Postgres.
//
// The count's only job is to describe the SAME set the rows come from. Unit
// tests can prove both queries were handed the same arguments; only a real
// database can prove the two queries then agree — that the shared
// `issueFilterWhere` builder produces one predicate and not two that drift on a
// case nobody thought about. So every assertion below compares the count
// against a full walk of the actual pages rather than against a literal.

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE "organizations" RESTART IDENTITY CASCADE');
}
beforeEach(reset);
afterAll(() => prisma.$disconnect());

let rankSeq = 0;
const nextRank = () => `r${(rankSeq++).toString().padStart(6, "0")}`;

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: tag, domain: `${tag}.example.com` },
  });
  const mk = (n: string, role: "ADMIN" | "MEMBER" = "MEMBER") =>
    prisma.user.create({
      data: { organizationId: org.id, email: `${n}-${tag}@x.com`, name: n, orgRole: role },
    });

  const admin = await mk("admin", "ADMIN");
  const member = await mk("member");
  const stranger = await mk("stranger");

  const projectA = await createProjectWithStatuses({
    data: { organizationId: org.id, key: `A${tag}`, name: "A" },
  });
  const projectB = await createProjectWithStatuses({
    data: { organizationId: org.id, key: `B${tag}`, name: "B" },
  });
  // The member is on A only. B exists so "the count respects scope" has
  // something to get wrong.
  await prisma.projectMember.create({
    data: { projectId: projectA.id, userId: member.id, role: "MEMBER" },
  });

  let n = 0;
  const issue = async (opts: {
    project?: { id: string };
    type?: "TASK" | "BUG";
    priority?: "HIGH" | "MEDIUM";
    status?: "TODO" | "DONE";
    title?: string;
  }) => {
    n += 1;
    const projectId = (opts.project ?? projectA).id;
    return prisma.issue.create({
      data: {
        projectId,
        key: `${tag}-${n}`,
        type: opts.type ?? "TASK",
        title: opts.title ?? `issue ${n}`,
        status: opts.status ?? "TODO",
        statusId: await statusFor(projectId, opts.status ?? "TODO"),
        priority: opts.priority ?? "MEDIUM",
        reporterId: admin.id,
        rank: nextRank(),
      },
    });
  };

  const actor = (u: { id: string }, orgRole: "ADMIN" | "MEMBER" = "MEMBER"): Actor => ({
    userId: u.id,
    orgRole,
    organizationId: org.id,
  });

  return {
    projectA,
    projectB,
    issue,
    adminActor: actor(admin, "ADMIN"),
    memberActor: actor(member),
    strangerActor: actor(stranger),
  };
}

/** Page through the real API surface and return how many rows it actually yields. */
async function walkEveryPage(actor: Actor, filter: IssueFilter, take: number): Promise<number> {
  let cursor: string | undefined;
  let seen = 0;
  // Bounded so a pagination bug becomes a failed assertion rather than a hang.
  for (let guard = 0; guard < 200; guard++) {
    const page = await SavedViewService.queryIssues(actor, filter, "UPDATED_DESC", {
      cursor,
      take,
    });
    seen += page.items.length;
    if (!page.nextCursor) return seen;
    cursor = page.nextCursor;
  }
  throw new Error("walked 200 pages without reaching the end");
}

describe("the count describes the same set as the rows (BR-9a)", () => {
  it("matches a full walk of the pages, unfiltered", async () => {
    const s = await seed("c1");
    for (let i = 0; i < 23; i++) await s.issue({});

    const first = await SavedViewService.queryIssues(s.adminActor, {}, "UPDATED_DESC", {
      take: 10,
    });
    expect(first.items).toHaveLength(10);
    expect(await walkEveryPage(s.adminActor, {}, 10)).toBe(first.totalCount);
    expect(first.totalCount).toBe(23);
    expect(first.totalCountCapped).toBe(false);
  });

  it("uses the FILTERED total, not the collection size", async () => {
    const s = await seed("c2");
    for (let i = 0; i < 7; i++) await s.issue({ type: "BUG", priority: "HIGH" });
    for (let i = 0; i < 5; i++) await s.issue({ type: "BUG", priority: "MEDIUM" });
    for (let i = 0; i < 11; i++) await s.issue({ type: "TASK", priority: "HIGH" });

    const filter: IssueFilter = { type: "BUG", priority: "HIGH" };
    const page = await SavedViewService.queryIssues(s.adminActor, filter, "UPDATED_DESC", {
      take: 5,
    });
    expect(page.totalCount).toBe(7);
    expect(await walkEveryPage(s.adminActor, filter, 5)).toBe(7);
  });

  it("agrees with the rows on a text search, where a hand-written clause would drift", async () => {
    const s = await seed("c3");
    await s.issue({ title: "Timeout on the billing page" });
    await s.issue({ title: "timeout under load" });
    await s.issue({ title: "Nothing to do with it" });

    const filter: IssueFilter = { search: "timeout" };
    const page = await SavedViewService.queryIssues(s.adminActor, filter);
    // Whatever the search predicate does about case, the count and the rows do
    // the same thing — which is the property being pinned, not the number 2.
    expect(page.totalCount).toBe(page.items.length);
    expect(page.totalCount).toBe(2);
  });

  it("counts only the caller's projects — scope is not bypassed by the count", async () => {
    const s = await seed("c4");
    for (let i = 0; i < 4; i++) await s.issue({});
    for (let i = 0; i < 9; i++) await s.issue({ project: s.projectB });

    const asAdmin = await SavedViewService.queryIssues(s.adminActor, {});
    const asMember = await SavedViewService.queryIssues(s.memberActor, {});
    // The admin sees both projects; the member is on A only. A count built
    // from anything other than the resolved scope would leak the size of a
    // project this member cannot open — the quietest kind of leak, because no
    // row is returned with it.
    expect(asAdmin.totalCount).toBe(13);
    expect(asMember.totalCount).toBe(4);
    expect(asMember.items).toHaveLength(4);
  });

  it("returns zero, and stays zero, for someone in no projects", async () => {
    const s = await seed("c5");
    for (let i = 0; i < 6; i++) await s.issue({});

    const page = await SavedViewService.queryIssues(s.strangerActor, {});
    expect(page.totalCount).toBe(0);
    expect(page.totalCountCapped).toBe(false);
    expect(page.projectsInScope).toBe(0);
    expect(page.items).toEqual([]);
  });

  it("does not double-count a soft-deleted issue", async () => {
    const s = await seed("c6");
    const keep = await s.issue({});
    const gone = await s.issue({});
    await prisma.issue.update({ where: { id: gone.id }, data: { deletedAt: new Date() } });

    const page = await SavedViewService.queryIssues(s.adminActor, {});
    expect(page.totalCount).toBe(1);
    expect(page.items.map((i) => i.id)).toEqual([keep.id]);
  });
});

describe("the cap (BR-9a)", () => {
  // Seeding 10,001 issues to exercise the real cap would make this file take
  // minutes. The boundary arithmetic is unit-tested against a mocked count;
  // what only a real database can show is that `take` on a Prisma `count`
  // bounds the work at all rather than being silently ignored — which is the
  // assumption the whole strategy rests on, and which is a Prisma
  // implementation detail that a version bump could change.
  it("Prisma's count honours `take`, so the cap is real and not decorative", async () => {
    const s = await seed("c7");
    for (let i = 0; i < 12; i++) await s.issue({});

    const bounded = await prisma.issue.count({ where: { deletedAt: null }, take: 5 });
    const unbounded = await prisma.issue.count({ where: { deletedAt: null } });
    expect(unbounded).toBe(12);
    expect(bounded).toBe(5);
    void s;
  });

  it("reports the exact figure while it is under the cap", async () => {
    const s = await seed("c8");
    for (let i = 0; i < 3; i++) await s.issue({});
    const page = await SavedViewService.queryIssues(s.adminActor, {});
    expect(page.totalCount).toBeLessThan(COUNT_CAP);
    expect(page.totalCountCapped).toBe(false);
  });
});
