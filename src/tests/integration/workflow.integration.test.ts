import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/shared/lib/db";
import { WorkflowService } from "@/features/workflow/services/workflow.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { BoardService } from "@/features/board/services/board.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { ConflictError, ForbiddenError, NotFoundError } from "@/shared/lib/errors";
import { DEFAULT_STATUSES } from "@/features/workflow/lib/defaults";
import type { Actor } from "@/shared/types/actor";

// Tier 4 — Custom statuses and workflow against a REAL Postgres (ADR-0049).
//
// The invariant in BR-2 — `Issue.status` always equals the category of
// `Issue.statusId` — cannot be a database constraint, because a CHECK cannot
// span two tables. This file is the guard: it asserts the pair after every path
// that can move an issue, so a future edit that writes one half without the
// other fails here rather than in a report six weeks later.

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

  // Through the SERVICE, so the status seeding that production does is the
  // seeding under test.
  const project = await ProjectService.create(actor(lead), {
    key: `P${tag}`.toUpperCase().slice(0, 8),
    name: "Project",
  });
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: member.id, role: "MEMBER" },
      { projectId: project.id, userId: viewer.id, role: "VIEWER" },
    ],
  });

  return {
    org,
    project,
    adminActor: actor(admin, "ADMIN"),
    leadActor: actor(lead),
    memberActor: actor(member),
    viewerActor: actor(viewer),
  };
}

/**
 * The pair that must never disagree (BR-2).
 *
 * Raw SQL because the comparison is between two tables' columns, which a
 * Prisma `where` cannot express — and because this is exactly the check a
 * CHECK constraint would make if a CHECK could span tables.
 */
async function invariantHolds(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ wrong: bigint }[]>`
    SELECT count(*) AS wrong
    FROM "issues" i
    JOIN "workflow_statuses" w ON w."id" = i."statusId"
    WHERE i."deletedAt" IS NULL AND w."category" <> i."status"
  `;
  return Number(rows[0]!.wrong) === 0;
}

describe("a new project is seeded (BR-7)", () => {
  it("starts with exactly the four default statuses, To Do the default", async () => {
    const s = await seed("wa");
    const statuses = await WorkflowService.listStatuses(s.leadActor, s.project.id);
    expect(statuses.map((x) => x.name)).toEqual(DEFAULT_STATUSES.map((d) => d.name));
    expect(statuses.find((x) => x.isDefault)?.name).toBe("To Do");
  });

  it("puts a new issue on the project's DEFAULT status, not on 'To Do' by name", async () => {
    const s = await seed("wb");
    const statuses = await WorkflowService.listStatuses(s.leadActor, s.project.id);
    const review = statuses.find((x) => x.category === "IN_REVIEW")!;
    await WorkflowService.update(s.leadActor, s.project.id, review.id, { isDefault: true });

    const issue = await IssueService.create(s.leadActor, s.project.id, {
      type: "TASK",
      title: "x",
      priority: "MEDIUM",
    });
    expect(issue.workflowStatus.name).toBe("In Review");
    // …and the cached category came with it.
    expect(issue.status).toBe("IN_REVIEW");
  });
});

describe("the invariant survives every write path (BR-2)", () => {
  it("holds after create, a status change, and a category change on the status", async () => {
    const s = await seed("wc");
    const statuses = await WorkflowService.listStatuses(s.leadActor, s.project.id);
    const blocked = await WorkflowService.create(s.leadActor, s.project.id, {
      name: "Blocked",
      category: "IN_PROGRESS",
      color: "rose",
    });

    const issue = await IssueService.create(s.leadActor, s.project.id, {
      type: "TASK",
      title: "x",
      priority: "MEDIUM",
    });
    expect(await invariantHolds()).toBe(true);

    const moved = await IssueService.transition(
      s.leadActor,
      issue.id,
      blocked.id,
      issue.version,
    );
    expect(moved.status).toBe("IN_PROGRESS");
    expect(await invariantHolds()).toBe(true);

    // Re-categorising the STATUS must drag its issues' cached category with it,
    // or every issue sitting on it becomes invisible to half the product.
    await WorkflowService.update(s.leadActor, s.project.id, blocked.id, {
      category: "IN_REVIEW",
    });
    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.status).toBe("IN_REVIEW");
    expect(await invariantHolds()).toBe(true);
    expect(statuses).toHaveLength(4);
  });

  it("holds after a delete moves issues to the replacement", async () => {
    const s = await seed("wd");
    const extra = await WorkflowService.create(s.leadActor, s.project.id, {
      name: "Blocked",
      category: "IN_PROGRESS",
      color: "rose",
    });
    const issue = await IssueService.create(s.leadActor, s.project.id, {
      type: "TASK",
      title: "x",
      priority: "MEDIUM",
    });
    await IssueService.transition(s.leadActor, issue.id, extra.id, issue.version);

    const statuses = await WorkflowService.listStatuses(s.leadActor, s.project.id);
    const inProgress = statuses.find((x) => x.name === "In Progress")!;
    const res = await WorkflowService.remove(s.leadActor, s.project.id, extra.id, {
      replacementId: inProgress.id,
    });

    expect(res.movedIssues).toBe(1);
    const after = await prisma.issue.findUniqueOrThrow({ where: { id: issue.id } });
    expect(after.statusId).toBe(inProgress.id);
    expect(after.status).toBe("IN_PROGRESS");
    expect(await invariantHolds()).toBe(true);
  });
});

describe("the board is data-driven", () => {
  it("gains a column when a status is added, in the position it was put", async () => {
    const s = await seed("we");
    await WorkflowService.create(s.leadActor, s.project.id, {
      name: "Blocked",
      category: "IN_PROGRESS",
      color: "rose",
    });

    let board = await BoardService.getBoard(s.leadActor, s.project.id, {});
    expect(board.columns.map((c) => c.status.name)).toEqual([
      "To Do",
      "In Progress",
      "In Review",
      "Done",
      "Blocked",
    ]);

    // Reorder puts it second.
    const statuses = await WorkflowService.listStatuses(s.leadActor, s.project.id);
    const byName = Object.fromEntries(statuses.map((x) => [x.name, x.id]));
    await WorkflowService.reorder(s.leadActor, s.project.id, {
      statusIds: [byName["To Do"]!, byName["Blocked"]!, byName["In Progress"]!, byName["In Review"]!, byName["Done"]!],
    });

    board = await BoardService.getBoard(s.leadActor, s.project.id, {});
    expect(board.columns.map((c) => c.status.name)[1]).toBe("Blocked");
  });
});

describe("refusals that protect the data (BR-5, BR-6)", () => {
  it("refuses to delete the default status", async () => {
    const s = await seed("wf");
    const statuses = await WorkflowService.listStatuses(s.leadActor, s.project.id);
    const todo = statuses.find((x) => x.isDefault)!;
    await expect(
      WorkflowService.remove(s.leadActor, s.project.id, todo.id, {
        replacementId: statuses.find((x) => x.name === "Done")!.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses to delete the last status in a category", async () => {
    const s = await seed("wg");
    const statuses = await WorkflowService.listStatuses(s.leadActor, s.project.id);
    const done = statuses.find((x) => x.name === "Done")!;
    await expect(
      WorkflowService.remove(s.leadActor, s.project.id, done.id, {
        replacementId: statuses.find((x) => x.name === "In Review")!.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a replacement in a different category — it would redefine 'done'", async () => {
    const s = await seed("wh");
    const extra = await WorkflowService.create(s.leadActor, s.project.id, {
      name: "Blocked",
      category: "IN_PROGRESS",
      color: "rose",
    });
    const statuses = await WorkflowService.listStatuses(s.leadActor, s.project.id);
    await expect(
      WorkflowService.remove(s.leadActor, s.project.id, extra.id, {
        replacementId: statuses.find((x) => x.name === "Done")!.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a duplicate name, case-insensitively (BR-4)", async () => {
    const s = await seed("wi");
    await expect(
      WorkflowService.create(s.leadActor, s.project.id, {
        name: "done",
        category: "DONE",
        color: "teal",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a partial reorder — the list must be complete (BR-8)", async () => {
    const s = await seed("wj");
    const statuses = await WorkflowService.listStatuses(s.leadActor, s.project.id);
    await expect(
      WorkflowService.reorder(s.leadActor, s.project.id, {
        statusIds: [statuses[0]!.id, statuses[1]!.id],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses enforcement with no rules — it would freeze every issue", async () => {
    const s = await seed("wk");
    await expect(
      WorkflowService.setTransitions(s.leadActor, s.project.id, {
        enforce: true,
        transitions: [],
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("transitions (BR-10)", () => {
  it("allows any move while unrestricted — the ClickUp/Asana default", async () => {
    const s = await seed("wl");
    const statuses = await WorkflowService.listStatuses(s.leadActor, s.project.id);
    const done = statuses.find((x) => x.name === "Done")!;
    const issue = await IssueService.create(s.leadActor, s.project.id, {
      type: "TASK",
      title: "x",
      priority: "MEDIUM",
    });
    // To Do straight to Done, which the old fixed workflow forbade.
    const moved = await IssueService.transition(s.leadActor, issue.id, done.id, issue.version);
    expect(moved.status).toBe("DONE");
  });

  it("refuses a disallowed move once restricted, naming what IS reachable", async () => {
    const s = await seed("wm");
    const statuses = await WorkflowService.listStatuses(s.leadActor, s.project.id);
    const byName = Object.fromEntries(statuses.map((x) => [x.name, x.id]));
    await WorkflowService.setTransitions(s.leadActor, s.project.id, {
      enforce: true,
      transitions: [{ fromStatusId: byName["To Do"]!, toStatusId: byName["In Progress"]! }],
    });

    const issue = await IssueService.create(s.leadActor, s.project.id, {
      type: "TASK",
      title: "x",
      priority: "MEDIUM",
    });
    await expect(
      IssueService.transition(s.leadActor, issue.id, byName["Done"]!, issue.version),
    ).rejects.toThrow(/In Progress/);

    // The picker offers exactly what the server accepts — no option that errors.
    const reachable = await WorkflowService.reachableStatuses(s.project.id, byName["To Do"]!);
    expect(reachable.map((x) => x.name).sort()).toEqual(["In Progress", "To Do"]);
  });
});

// BR-9 — the matrix.
describe("who can administer statuses", () => {
  it("lets a LEAD and an org ADMIN manage them", async () => {
    const s = await seed("wn");
    for (const actor of [s.leadActor, s.adminActor]) {
      const view = await WorkflowService.get(actor, s.project.id);
      expect(view.canManage).toBe(true);
    }
  });

  it("lets a MEMBER and a VIEWER read but not manage", async () => {
    const s = await seed("wo");
    for (const actor of [s.memberActor, s.viewerActor]) {
      const view = await WorkflowService.get(actor, s.project.id);
      expect(view.statuses).toHaveLength(4);
      expect(view.canManage).toBe(false);
      await expect(
        WorkflowService.create(actor, s.project.id, {
          name: "Nope",
          category: "TODO",
          color: "teal",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("lets a MEMBER move an issue even though they cannot edit statuses", async () => {
    const s = await seed("wp");
    const statuses = await WorkflowService.listStatuses(s.memberActor, s.project.id);
    const issue = await IssueService.create(s.memberActor, s.project.id, {
      type: "TASK",
      title: "x",
      priority: "MEDIUM",
    });
    const moved = await IssueService.transition(
      s.memberActor,
      issue.id,
      statuses.find((x) => x.name === "Done")!.id,
      issue.version,
    );
    expect(moved.status).toBe("DONE");
  });

  it("404s a project in another organization (F-1)", async () => {
    const a = await seed("wq");
    const b = await seed("wr");
    await expect(
      WorkflowService.get(b.adminActor, a.project.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s a status id from another project", async () => {
    const a = await seed("ws");
    const b = await seed("wt");
    const foreign = (await WorkflowService.listStatuses(b.leadActor, b.project.id))[0]!;
    await expect(
      WorkflowService.requireStatus(a.project.id, foreign.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
