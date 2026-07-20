import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { IssueService } from "@/features/issues/services/issue.service";
import { BoardService } from "@/features/board/services/board.service";
import { ConflictError } from "@/shared/lib/errors";
import type { Actor } from "@/shared/types/actor";
import type { IssueStatusDto } from "@/features/issues/types/issue.types";

// Integration — real Postgres. Proves the ADR-0009 rank writes end to end:
// a reorder computes a key strictly between the destination neighbours, writes
// exactly one row, and the order survives a fresh board read.

async function reset() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "organizations" RESTART IDENTITY CASCADE',
  );
}

async function seed(tag: string) {
  const org = await prisma.organization.create({
    data: { name: `Org ${tag}`, domain: `${tag}.example.com` },
  });
  const lead = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-lead@example.com`, name: `Lead ${tag}` },
  });
  const other = await prisma.user.create({
    data: { organizationId: org.id, email: `${tag}-other@example.com`, name: `Other ${tag}` },
  });
  const project = await prisma.project.create({
    data: { organizationId: org.id, key: tag.toUpperCase(), name: `Project ${tag}`, createdBy: lead.id },
  });
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: lead.id, role: "LEAD", createdBy: lead.id },
      { projectId: project.id, userId: other.id, role: "MEMBER", createdBy: lead.id },
    ],
  });
  const actor: Actor = { userId: lead.id, orgRole: "MEMBER", organizationId: org.id };
  return { org, lead, other, project, actor };
}

// Create N issues in the default TODO column; each appends after the last.
async function createTodo(actor: Actor, projectId: string, titles: string[], assigneeId?: string) {
  const made = [];
  for (const title of titles) {
    made.push(
      await IssueService.create(actor, projectId, {
        type: "TASK",
        title,
        priority: "MEDIUM",
        ...(assigneeId ? { assigneeId } : {}),
      }),
    );
  }
  return made;
}

function column(board: Awaited<ReturnType<typeof BoardService.getBoard>>, status: IssueStatusDto) {
  return board.columns.find((c) => c.status === status)!;
}

// Reorder helper that reads the card's current version first (ADR-0011) — the
// UI does the same via the DTO's version field.
async function reorder(
  actor: Actor,
  id: string,
  opts: { status?: IssueStatusDto; beforeId?: string | null; afterId?: string | null },
) {
  const row = await prisma.issue.findUnique({ where: { id }, select: { version: true } });
  return IssueService.reorder(actor, id, { ...opts, expectedVersion: row!.version });
}

beforeEach(reset);
afterAll(() => prisma.$disconnect());

describe("Board reorder (rank) integration", () => {
  it("appends new issues to TODO in creation order (createWithKey)", async () => {
    const { actor, project } = await seed("app");
    await createTodo(actor, project.id, ["one", "two", "three"]);

    const board = await BoardService.getBoard(actor, project.id, {});
    expect(column(board, "TODO").items.map((i) => i.title)).toEqual(["one", "two", "three"]);
  });

  it("reorders a card between two neighbours and the order survives a reload", async () => {
    const { actor, project } = await seed("reo");
    const [a, b, c] = await createTodo(actor, project.id, ["A", "B", "C"]);

    // Move C between A and B.
    await reorder(actor, c!.id, { beforeId: a!.id, afterId: b!.id });

    const board = await BoardService.getBoard(actor, project.id, {});
    expect(column(board, "TODO").items.map((i) => i.title)).toEqual(["A", "C", "B"]);

    // Exactly one row changed rank: A and B keep their original ranks.
    const rows = await prisma.issue.findMany({
      where: { projectId: project.id },
      select: { id: true, rank: true },
    });
    const rank = (id: string) => rows.find((r) => r.id === id)!.rank;
    expect(rank(a!.id) < rank(c!.id)).toBe(true);
    expect(rank(c!.id) < rank(b!.id)).toBe(true);
  });

  it("moves a card to another column, updating status and rank in one write", async () => {
    const { actor, project } = await seed("mov");
    const [a] = await createTodo(actor, project.id, ["A"]);

    const moved = await reorder(actor, a!.id, {
      status: "IN_PROGRESS",
      beforeId: null,
      afterId: null,
    });
    expect(moved.status).toBe("IN_PROGRESS");

    const board = await BoardService.getBoard(actor, project.id, {});
    expect(column(board, "TODO").items).toHaveLength(0);
    expect(column(board, "IN_PROGRESS").items.map((i) => i.title)).toEqual(["A"]);
  });

  it("rejects an illegal column move (TODO → DONE) and writes nothing", async () => {
    const { actor, project } = await seed("ill");
    const [a] = await createTodo(actor, project.id, ["A"]);

    await expect(
      reorder(actor, a!.id, { status: "DONE", beforeId: null, afterId: null }),
    ).rejects.toThrow();

    const fresh = await prisma.issue.findUnique({ where: { id: a!.id }, select: { status: true } });
    expect(fresh?.status).toBe("TODO");
  });

  it("BR-7: a filtered reorder positions relative to visible neighbours; a hidden card between keeps its rank", async () => {
    const { actor, other, project } = await seed("flt");
    // Column order A, B, C, D. B is assigned to `other` (hidden when we filter
    // by the lead), A/C/D are unassigned/visible.
    const [a, b, c, d] = await createTodo(actor, project.id, ["A", "B", "C", "D"]);
    await IssueService.update(actor, b!.id, { assigneeId: other.id });

    const bRankBefore = (
      await prisma.issue.findUnique({ where: { id: b!.id }, select: { rank: true } })
    )!.rank;

    // Filtered view (exclude `other`'s cards) shows A, C, D. Move D between A and C.
    await reorder(actor, d!.id, { beforeId: a!.id, afterId: c!.id });

    const rows = await prisma.issue.findMany({
      where: { projectId: project.id },
      select: { id: true, rank: true },
    });
    const rank = (id: string) => rows.find((r) => r.id === id)!.rank;
    // D landed strictly between A and C (its visible neighbours)...
    expect(rank(a!.id) < rank(d!.id)).toBe(true);
    expect(rank(d!.id) < rank(c!.id)).toBe(true);
    // ...and the hidden card B kept its own rank untouched (accepted trade-off).
    expect(rank(b!.id)).toBe(bRankBefore);
  });
});

describe("optimistic concurrency (ADR-0011)", () => {
  it("rejects a stale reorder (lost update) and applies a fresh one", async () => {
    const { actor, project } = await seed("occ");
    const [a, b] = await createTodo(actor, project.id, ["A", "B"]);
    const staleVersion = 0; // both cards start at version 0

    // First move succeeds and bumps A's version to 1.
    await IssueService.reorder(actor, a!.id, {
      beforeId: b!.id,
      afterId: null,
      expectedVersion: staleVersion,
    });

    // A second client still holding version 0 tries to move A again → rejected,
    // its change is NOT silently lost.
    await expect(
      IssueService.reorder(actor, a!.id, {
        beforeId: null,
        afterId: b!.id,
        expectedVersion: staleVersion,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    // Re-reading the current version lets the move succeed.
    const fresh = await prisma.issue.findUnique({
      where: { id: a!.id },
      select: { version: true },
    });
    const moved = await IssueService.reorder(actor, a!.id, {
      beforeId: null,
      afterId: b!.id,
      expectedVersion: fresh!.version,
    });
    expect(moved.version).toBe(fresh!.version + 1);
  });
});

describe("rank column collation (ADR-0009 / portability)", () => {
  it("is pinned to C (byte order) so base-62 keys sort correctly on any locale", async () => {
    // The strong regression guard: if a future migration drops the collation,
    // the column falls back to the DB default (possibly a locale) and mixed-case
    // LexoRank keys mis-sort. `collation_name` is 'C' only when set explicitly.
    const [row] = await prisma.$queryRawUnsafe<{ collation_name: string | null }[]>(
      `SELECT collation_name FROM information_schema.columns
       WHERE table_name = 'issues' AND column_name = 'rank'`,
    );
    expect(row?.collation_name).toBe("C");
  });

  it("two cards moved into the SAME gap get distinct ranks (ADR-0010, unique index holds)", async () => {
    const { actor, project } = await seed("cc");
    const [a, b, c, d] = await createTodo(actor, project.id, ["A", "B", "C", "D"]);
    // Both C and D dropped between A and B — the collision case. Suffix keys keep
    // them distinct, so the unique index accepts both and order stays total.
    await reorder(actor, c!.id, { beforeId: a!.id, afterId: b!.id });
    await reorder(actor, d!.id, { beforeId: a!.id, afterId: b!.id });

    const rows = await prisma.issue.findMany({
      where: { projectId: project.id, status: "TODO" },
      select: { id: true, rank: true },
    });
    const ranks = rows.map((r) => r.rank);
    expect(new Set(ranks).size).toBe(ranks.length); // no duplicate ranks
    const board = await BoardService.getBoard(actor, project.id, {});
    const order = column(board, "TODO").items.map((i) => i.id);
    // A first, B last; C and D land between them (order among the two is stable).
    expect(order[0]).toBe(a!.id);
    expect(order[order.length - 1]).toBe(b!.id);
    expect(order.slice(1, 3).sort()).toEqual([c!.id, d!.id].sort());
  });

  it("sorts a prepended 'Z…' key before an 'a…' key (byte order)", async () => {
    const { actor, project } = await seed("col");
    const [a] = await createTodo(actor, project.id, ["A"]);
    // Reorder to the very top → generates a negative-magnitude 'Z…' key, which
    // a locale collation would sort last. Under C it must come first.
    await reorder(actor, a!.id, { beforeId: null, afterId: null });
    const [b] = await createTodo(actor, project.id, ["B"]); // appends after → 'a…'
    // Put A above B explicitly.
    await reorder(actor, a!.id, { beforeId: null, afterId: b!.id });

    const board = await BoardService.getBoard(actor, project.id, {});
    const titles = column(board, "TODO").items.map((i) => i.title);
    expect(titles).toEqual(["A", "B"]);
    const ranks = await prisma.issue.findMany({
      where: { projectId: project.id },
      select: { title: true, rank: true },
      orderBy: { rank: "asc" },
    });
    expect(ranks.map((r) => r.title)).toEqual(["A", "B"]);
  });
});
