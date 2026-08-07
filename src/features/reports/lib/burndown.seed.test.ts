import { describe, expect, it } from "vitest";
import { generateVerus } from "../../../../prisma/verus/generate";
import { buildBurndown, type BurndownIssue, type StatusTransition } from "./burndown";

// The regression this file exists for.
//
// Burndown shipped drawing a flat line on every VERUS sprint, and the unit
// tests all passed — because they ran against fixtures written by the same
// person who wrote the assumptions. The demo data had three independent
// defects: the active sprint received no DONE issues at all, completion
// timestamps derived from an issue's createdAt rather than its sprint's window,
// and AUDIT_CAP starved most DONE issues of history entirely.
//
// So this replays the ACTUAL generated dataset through the ACTUAL engine. No
// database, no fixtures, no assumptions of mine in the middle.

const dataset = generateVerus() as unknown as {
  sprints: { id: string; name: string; status: string; startDate: Date; endDate: Date }[];
  issues: Record<string, unknown>[];
  epics: Record<string, unknown>[];
  auditLogs: {
    action: string;
    entityId: string;
    beforeData: unknown;
    afterData: unknown;
    createdAt: Date;
  }[];
};

const transitions: StatusTransition[] = dataset.auditLogs
  .filter((a) => a.action === "ISSUE_STATUS_CHANGED")
  .map((a) => ({
    issueId: a.entityId,
    from: (a.beforeData as { status?: string } | null)?.status ?? null,
    to: (a.afterData as { status?: string } | null)?.status ?? null,
    at: new Date(a.createdAt),
  }));

const allIssues = [...dataset.issues, ...dataset.epics] as unknown as {
  id: string;
  sprintId: string | null;
  status?: string;
  storyPoints?: number | null;
  estimateMinutes?: number | null;
}[];

function seriesFor(sprint: (typeof dataset.sprints)[number]) {
  const cohort: BurndownIssue[] = allIssues
    .filter((i) => i.sprintId === sprint.id)
    .map((i) => ({
      id: i.id,
      status: i.status ?? "TODO",
      storyPoints: i.storyPoints ?? null,
      estimateMinutes: i.estimateMinutes ?? null,
    }));
  return {
    cohort,
    series: buildBurndown(
      cohort,
      transitions,
      { startDate: new Date(sprint.startDate), endDate: new Date(sprint.endDate) },
      "points",
      new Date(),
    ),
  };
}

const runnable = dataset.sprints.filter(
  (s) => s.status === "ACTIVE" || s.status === "COMPLETED",
);

describe("the VERUS demo data must produce a real burndown", () => {
  it("has sprints that have actually run", () => {
    expect(runnable.length).toBeGreaterThan(0);
  });

  it("draws a descending line for every runnable sprint — none flat", () => {
    const flat = runnable
      .map((s) => ({ name: s.name, ...seriesFor(s) }))
      .filter((r) => r.cohort.length > 0 && r.series.flatReason !== null)
      .map((r) => `${r.name}: ${r.series.flatReason}`);

    expect(flat).toEqual([]);
  });

  it("burns a completed sprint down to zero", () => {
    const completed = runnable.filter((s) => s.status === "COMPLETED");
    expect(completed.length).toBeGreaterThan(0);

    for (const sprint of completed) {
      const { cohort, series } = seriesFor(sprint);
      if (cohort.length === 0) continue;
      expect(series.points[0]!.remaining).toBeGreaterThan(0);
      expect(series.points[series.points.length - 1]!.remaining).toBe(0);
    }
  });

  it("leaves an active sprint part-way down, not at either extreme", () => {
    const active = runnable.filter((s) => s.status === "ACTIVE");
    expect(active.length).toBeGreaterThan(0);

    for (const sprint of active) {
      const { cohort, series } = seriesFor(sprint);
      if (cohort.length === 0) continue;
      const last = series.points[series.points.length - 1]!.remaining;
      expect(last).toBeGreaterThan(0); // still work to do
      expect(last).toBeLessThan(series.scope); // but some of it is done
    }
  });

  it("gives every sprinted DONE issue recorded history, so none is silently assumed", () => {
    // untrackedDone is the counter for "Done, but we never saw it happen".
    // Inside a sprint it should be zero — those are the rows reports replay.
    for (const sprint of runnable) {
      const { cohort, series } = seriesFor(sprint);
      if (cohort.length === 0) continue;
      expect(series.untrackedDone).toBe(0);
    }
  });
});
