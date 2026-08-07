import { prisma } from "@/shared/lib/db";

// Prisma is imported ONLY in *.repository.ts files (Feature Architecture §4).
// Reports are READ-ONLY over existing tables — no aggregate/materialized tables
// (ADR-0020, no data duplication).

export const ReportRepository = {
  // Velocity (BR-1): completed story points + issue count per COMPLETED sprint,
  // most recent `limit`, returned oldest→newest for the chart.
  async completedSprintVelocity(projectId: string, limit = 8) {
    const sprints = await prisma.sprint.findMany({
      where: { projectId, status: "COMPLETED", deletedAt: null },
      select: { id: true, name: true, endDate: true },
      orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    if (sprints.length === 0) return [];

    const grouped = await prisma.issue.groupBy({
      by: ["sprintId"],
      where: { sprintId: { in: sprints.map((s) => s.id) }, status: "DONE", deletedAt: null },
      _sum: { storyPoints: true },
      _count: { _all: true },
    });
    const bySprint = new Map(grouped.map((g) => [g.sprintId, g]));

    return sprints
      .reverse()
      .map((s) => ({
        name: s.name,
        points: bySprint.get(s.id)?._sum.storyPoints ?? 0,
        issues: bySprint.get(s.id)?._count._all ?? 0,
      }));
  },

  // Status breakdown (BR-2): live count of non-deleted issues per status.
  async statusBreakdown(projectId: string) {
    const grouped = await prisma.issue.groupBy({
      by: ["status"],
      where: { projectId, deletedAt: null },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  },

  // Burndown (BR-4, ADR-0037): the sprints a burndown can be drawn for —
  // anything that has actually run. A PLANNED sprint has no history yet.
  burndownSprints(projectId: string, limit = 12) {
    return prisma.sprint.findMany({
      where: {
        projectId,
        deletedAt: null,
        status: { in: ["ACTIVE", "COMPLETED"] },
        startDate: { not: null },
        endDate: { not: null },
      },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
      // Active first, then most recently finished — the sprint a lead is most
      // likely to want is the one currently running.
      orderBy: [{ status: "asc" }, { endDate: "desc" }],
      take: limit,
    });
  },

  // The cohort: issues in the sprint RIGHT NOW. Membership history does not
  // exist (ADR-0037 §1) — the chart says so rather than the query pretending.
  sprintCohort(sprintId: string) {
    return prisma.issue.findMany({
      where: { sprintId, deletedAt: null },
      select: { id: true, status: true, storyPoints: true, estimateMinutes: true },
    });
  },

  // Full status history for the cohort. Not windowed to the sprint: a transition
  // BEFORE the sprint started is what tells us the starting status, and the
  // earliest row's `beforeData` is what makes the replay exact.
  statusHistory(issueIds: string[]) {
    if (issueIds.length === 0) return Promise.resolve([]);
    return prisma.auditLog.findMany({
      where: {
        // `entityType` is not a redundant filter — it is the LEADING column of
        // `audit_logs(entityType, entityId, createdAt)`. Without it Postgres
        // cannot use that index and scans a table that grows forever. A sprint
        // of 700+ issues makes the difference obvious.
        entityType: "Issue",
        action: "ISSUE_STATUS_CHANGED",
        entityId: { in: issueIds },
      },
      select: { entityId: true, beforeData: true, afterData: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  },

  // Cycle time (BR-3): the ISSUE_STATUS_CHANGED transitions for issues that
  // reached DONE within the window. Audit logs aren't project-scoped, so we
  // first resolve the project's issue ids, then read their transition history
  // (the IN_PROGRESS entry may pre-date the window, so full history is needed).
  async cycleTimeTransitions(projectId: string, since: Date) {
    const issues = await prisma.issue.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true },
    });
    const issueIds = issues.map((i) => i.id);
    if (issueIds.length === 0) return [];

    const doneRecent = await prisma.auditLog.findMany({
      where: {
        action: "ISSUE_STATUS_CHANGED",
        entityId: { in: issueIds },
        createdAt: { gte: since },
        afterData: { path: ["status"], equals: "DONE" },
      },
      select: { entityId: true },
      distinct: ["entityId"],
    });
    const doneIds = doneRecent.map((d) => d.entityId);
    if (doneIds.length === 0) return [];

    const logs = await prisma.auditLog.findMany({
      where: { action: "ISSUE_STATUS_CHANGED", entityId: { in: doneIds } },
      select: { entityId: true, afterData: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return logs.map((l) => ({
      entityId: l.entityId,
      status: (l.afterData as { status?: string } | null)?.status ?? null,
      createdAt: l.createdAt,
    }));
  },
};
