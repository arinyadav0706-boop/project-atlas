import { prisma } from "@/shared/lib/db";
import { NotFoundError } from "@/shared/lib/errors";
import type { Prisma } from "@prisma/client";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §4).
// Sprint lifecycle + the derived progress read live here; issue membership
// writes stay in issue.repository (one owner per table's mutations).

const sprintSelect = {
  id: true,
  projectId: true,
  name: true,
  goal: true,
  status: true,
  startDate: true,
  endDate: true,
} as const;

// The card shape the sprint panel renders — identical to the backlog/board card
// so the shared IssueListItemDto mapper works unchanged.
const cardSelect = {
  id: true,
  projectId: true,
  key: true,
  type: true,
  title: true,
  status: true,
  priority: true,
  storyPoints: true,
  updatedAt: true,
  version: true,
  assignee: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export const SprintRepository = {
  create(input: { projectId: string; name: string; goal: string | null; actorId: string }) {
    return prisma.sprint.create({
      data: {
        projectId: input.projectId,
        name: input.name,
        goal: input.goal,
        createdBy: input.actorId,
      },
      select: sprintSelect,
    });
  },

  listByProject(projectId: string) {
    return prisma.sprint.findMany({
      where: { projectId, deletedAt: null },
      select: sprintSelect,
      // ACTIVE first, then PLANNED, then COMPLETED — newest within each.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
  },

  findById(id: string) {
    return prisma.sprint.findFirst({
      where: { id, deletedAt: null },
      select: sprintSelect,
    });
  },

  // Non-completed sprints for the planning view (ADR-0015): the ACTIVE one and
  // all PLANNED ones. Enum order is PLANNED < ACTIVE, so `status desc` puts
  // ACTIVE first; within a status, oldest-created first (the planning queue).
  listPlanning(projectId: string) {
    return prisma.sprint.findMany({
      where: { projectId, status: { in: ["PLANNED", "ACTIVE"] }, deletedAt: null },
      select: sprintSelect,
      orderBy: [{ status: "desc" }, { createdAt: "asc" }],
    });
  },

  // Completed sprints for the past-sprints section, most-recently-ended first.
  listCompleted(projectId: string) {
    return prisma.sprint.findMany({
      where: { projectId, status: "COMPLETED", deletedAt: null },
      select: sprintSelect,
      orderBy: [{ endDate: "desc" }, { updatedAt: "desc" }],
    });
  },

  // The project's "current" sprint for the Backlog page: the ACTIVE one, else
  // the earliest-created PLANNED one. Null if the project has neither.
  async findCurrent(projectId: string) {
    const active = await prisma.sprint.findFirst({
      where: { projectId, status: "ACTIVE", deletedAt: null },
      select: sprintSelect,
    });
    if (active) return active;
    return prisma.sprint.findFirst({
      where: { projectId, status: "PLANNED", deletedAt: null },
      select: sprintSelect,
      orderBy: { createdAt: "asc" },
    });
  },

  update(id: string, data: Prisma.SprintUncheckedUpdateInput, actorId: string) {
    return prisma.sprint.update({
      where: { id },
      data: { ...data, updatedBy: actorId },
      select: sprintSelect,
    });
  },

  // Start (PLANNED → ACTIVE) with the one-ACTIVE-per-project rule (BR-1) enforced
  // transactionally: the count and the state change share a transaction so two
  // concurrent starts can't both win. Throws ConflictError-worthy signals to the
  // service via the returned discriminator.
  async start(id: string, projectId: string, actorId: string) {
    return prisma.$transaction(async (tx) => {
      const activeCount = await tx.sprint.count({
        where: { projectId, status: "ACTIVE", deletedAt: null, id: { not: id } },
      });
      if (activeCount > 0) return { ok: false as const, reason: "ANOTHER_ACTIVE" as const };
      const sprint = await tx.sprint.update({
        where: { id },
        data: { status: "ACTIVE", updatedBy: actorId },
        select: sprintSelect,
      });
      return { ok: true as const, sprint };
    });
  },

  // Complete (ACTIVE → COMPLETED): flip the sprint and move every non-DONE issue
  // to `targetSprintId` (a follow-up PLANNED sprint) or, when null, back to the
  // backlog — keeping its rank — in one transaction (BR-3). Ranks are untouched,
  // so issues reappear in order.
  async complete(id: string, projectId: string, actorId: string, targetSprintId: string | null) {
    return prisma.$transaction(async (tx) => {
      const returned = await tx.issue.updateMany({
        where: { sprintId: id, status: { not: "DONE" }, deletedAt: null },
        data: { sprintId: targetSprintId, updatedBy: actorId },
      });
      const sprint = await tx.sprint.update({
        where: { id },
        data: { status: "COMPLETED", updatedBy: actorId },
        select: sprintSelect,
      });
      return { sprint, returnedCount: returned.count };
    });
  },

  // Basic progress (ADR-0014, BR-7): counts + story-point sums grouped by status
  // over the sprint's non-deleted issues. Computed at read time; nothing stored.
  progressByStatus(sprintId: string) {
    return prisma.issue.groupBy({
      by: ["status"],
      where: { sprintId, deletedAt: null },
      _count: { _all: true },
      _sum: { storyPoints: true },
    });
  },

  // The sprint's issues, ordered by the shared rank (ADR-0013), for the panel.
  listSprintIssues(projectId: string, sprintId: string) {
    return prisma.issue.findMany({
      where: { projectId, sprintId, deletedAt: null },
      select: cardSelect,
      orderBy: [{ rank: "asc" }, { id: "asc" }],
    });
  },

  // Return every issue in a sprint to the backlog (sprintId = null), keeping its
  // rank — used before deleting a planned sprint so issues are never stranded.
  releaseIssues(sprintId: string, actorId: string) {
    return prisma.issue.updateMany({
      where: { sprintId, deletedAt: null },
      data: { sprintId: null, updatedBy: actorId },
    });
  },

  softDelete(id: string, actorId: string) {
    return prisma.sprint.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorId },
      select: sprintSelect,
    });
  },

  // Read a sprint's status guarding a move (BR-5 immutability): the caller needs
  // the target/source sprint's status before deciding whether a move is allowed.
  async statusOf(id: string): Promise<"PLANNED" | "ACTIVE" | "COMPLETED"> {
    const sprint = await prisma.sprint.findFirst({
      where: { id, deletedAt: null },
      select: { status: true },
    });
    if (!sprint) throw new NotFoundError("Sprint not found.");
    return sprint.status;
  },
};
