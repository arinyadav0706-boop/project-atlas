import { describe, expect, it } from "vitest";
import {
  buildBurndown,
  burndownDays,
  sizeOf,
  statusAt,
  type BurndownIssue,
  type StatusTransition,
} from "./burndown";

// Burndown is the only report that reads history (ADR-0037), so the replay is
// pinned here rather than only through the registry.

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const at = (iso: string) => new Date(iso);

const issue = (over: Partial<BurndownIssue> = {}): BurndownIssue => ({
  id: "i1",
  status: "TODO",
  storyPoints: 5,
  estimateMinutes: 480,
  ...over,
});

const move = (
  issueId: string,
  from: string | null,
  to: string,
  when: string,
): StatusTransition => ({ issueId, from, to, at: at(when) });

// Mon 3 Aug → Fri 14 Aug, a 12-day sprint.
const SPRINT = { startDate: utc("2026-08-03"), endDate: utc("2026-08-14") };
const AFTER = utc("2026-09-01"); // "now", well past the sprint

describe("statusAt replays history exactly (ADR-0037 §2)", () => {
  const history = [
    move("i1", "TODO", "IN_PROGRESS", "2026-08-05T10:00:00Z"),
    move("i1", "IN_PROGRESS", "DONE", "2026-08-09T15:00:00Z"),
  ];

  it("uses the prior state recorded on the earliest transition, never a guess", () => {
    // Before anything happened, `beforeData` tells us it was TODO — even though
    // the issue is DONE today.
    expect(statusAt("DONE", history, at("2026-08-04T00:00:00Z"))).toBe("TODO");
  });

  it("returns the state set by the most recent transition", () => {
    expect(statusAt("DONE", history, at("2026-08-06T00:00:00Z"))).toBe("IN_PROGRESS");
    expect(statusAt("DONE", history, at("2026-08-10T00:00:00Z"))).toBe("DONE");
  });

  it("treats a transition exactly on the sample instant as already applied", () => {
    expect(statusAt("DONE", history, at("2026-08-09T15:00:00Z"))).toBe("DONE");
  });

  it("falls back to the current status when the issue never changed", () => {
    expect(statusAt("IN_REVIEW", [], at("2026-08-06T00:00:00Z"))).toBe("IN_REVIEW");
  });
});

describe("burndownDays", () => {
  it("covers the sprint inclusively", () => {
    const days = burndownDays(SPRINT.startDate, SPRINT.endDate, AFTER);
    expect(days).toHaveLength(12);
    expect(days[0]).toEqual(utc("2026-08-03"));
    expect(days[11]).toEqual(utc("2026-08-14"));
  });

  it("stops at today for a sprint still running", () => {
    const days = burndownDays(SPRINT.startDate, SPRINT.endDate, utc("2026-08-06"));
    expect(days).toHaveLength(4);
    expect(days[3]).toEqual(utc("2026-08-06"));
  });

  it("is empty when the sprint has not started", () => {
    expect(burndownDays(SPRINT.startDate, SPRINT.endDate, utc("2026-08-01"))).toEqual([]);
  });
});

describe("sizeOf never imputes a missing value", () => {
  it("counts a null story point as zero, not as an average", () => {
    expect(sizeOf(issue({ storyPoints: null }), "points")).toBe(0);
  });

  it("counts every issue as one under the issues unit", () => {
    expect(sizeOf(issue({ storyPoints: null, estimateMinutes: null }), "issues")).toBe(1);
  });

  it("keeps hours in minutes so nothing rounds before the sum", () => {
    expect(sizeOf(issue({ estimateMinutes: 90 }), "hours")).toBe(90);
  });
});

describe("buildBurndown draws the real curve", () => {
  const issues = [
    issue({ id: "a", status: "DONE", storyPoints: 3 }),
    issue({ id: "b", status: "DONE", storyPoints: 5 }),
    issue({ id: "c", status: "IN_PROGRESS", storyPoints: 2 }),
  ];
  const transitions = [
    move("a", "TODO", "DONE", "2026-08-05T12:00:00Z"),
    move("b", "TODO", "IN_PROGRESS", "2026-08-04T09:00:00Z"),
    move("b", "IN_PROGRESS", "DONE", "2026-08-11T09:00:00Z"),
    move("c", "TODO", "IN_PROGRESS", "2026-08-06T09:00:00Z"),
  ];

  const series = buildBurndown(issues, transitions, SPRINT, "points", AFTER);
  const on = (day: string) => series.points.find((p) => p.day === day)!;

  it("starts at full scope before anything is finished", () => {
    expect(series.scope).toBe(10);
    expect(on("2026-08-03").remaining).toBe(10);
  });

  it("drops on the day each issue actually reached Done", () => {
    expect(on("2026-08-04").remaining).toBe(10); // b only moved to In Progress
    expect(on("2026-08-05").remaining).toBe(7); // a done (-3)
    expect(on("2026-08-10").remaining).toBe(7); // nothing between
    expect(on("2026-08-11").remaining).toBe(2); // b done (-5)
  });

  it("leaves unfinished work on the line at sprint end", () => {
    expect(on("2026-08-14").remaining).toBe(2); // c never finished
  });

  it("draws an ideal from scope to zero across the planned sprint", () => {
    expect(on("2026-08-03").ideal).toBe(10);
    expect(on("2026-08-14").ideal).toBe(0);
  });

  it("keeps the ideal spanning the whole sprint even when truncated at today", () => {
    // Viewed on day 2, the ideal must not already be at zero.
    const partial = buildBurndown(issues, transitions, SPRINT, "points", utc("2026-08-04"));
    expect(partial.points).toHaveLength(2);
    expect(partial.points[1]!.ideal).toBeCloseTo(10 - 10 / 11, 5);
  });
});

describe("the honesty counters (ADR-0037 §4)", () => {
  it("counts issues carrying no value for the chosen unit", () => {
    const series = buildBurndown(
      [issue({ id: "a", storyPoints: 3 }), issue({ id: "b", storyPoints: null })],
      [],
      SPRINT,
      "points",
      AFTER,
    );
    expect(series.unsized).toBe(1);
    expect(series.scope).toBe(3); // the null contributes 0, never a guess
  });

  it("reports no unsized issues when counting issues", () => {
    const series = buildBurndown(
      [issue({ id: "a", storyPoints: null, estimateMinutes: null })],
      [],
      SPRINT,
      "issues",
      AFTER,
    );
    expect(series.unsized).toBe(0);
    expect(series.scope).toBe(1);
  });

  it("flags work that is Done now but has no recorded DONE transition", () => {
    // Predates audit logging: replay must call it Done throughout, and say so.
    const series = buildBurndown(
      [issue({ id: "a", status: "DONE", storyPoints: 3 })],
      [],
      SPRINT,
      "points",
      AFTER,
    );
    expect(series.untrackedDone).toBe(1);
    expect(series.points[0]!.remaining).toBe(0);
  });

  it("does not flag Done work whose transition was recorded", () => {
    const series = buildBurndown(
      [issue({ id: "a", status: "DONE", storyPoints: 3 })],
      [move("a", "TODO", "DONE", "2026-08-05T12:00:00Z")],
      SPRINT,
      "points",
      AFTER,
    );
    expect(series.untrackedDone).toBe(0);
    expect(series.points[0]!.remaining).toBe(3); // still open on day 1
  });
});

describe("flatReason names why a line never moved", () => {
  it("is null when the line actually moves", () => {
    const series = buildBurndown(
      [issue({ id: "a", status: "DONE", storyPoints: 3 })],
      [move("a", "TODO", "DONE", "2026-08-06T09:00:00Z")],
      SPRINT,
      "points",
      AFTER,
    );
    expect(series.flatReason).toBeNull();
  });

  it("reports NOTHING_COMPLETED for a sprint where nothing reached Done", () => {
    // Exactly the VERUS active-sprint case: real work, real size, no completions.
    const series = buildBurndown(
      [
        issue({ id: "a", status: "IN_PROGRESS", storyPoints: 5 }),
        issue({ id: "b", status: "TODO", storyPoints: 8 }),
      ],
      [move("a", "TODO", "IN_PROGRESS", "2026-08-05T09:00:00Z")],
      SPRINT,
      "points",
      AFTER,
    );
    expect(series.flatReason).toBe("NOTHING_COMPLETED");
    expect(series.points.every((p) => p.remaining === 13)).toBe(true);
  });

  it("reports ALL_DONE_BEFORE when the line sits at zero throughout", () => {
    const series = buildBurndown(
      [issue({ id: "a", status: "DONE", storyPoints: 3 })],
      [move("a", "TODO", "DONE", "2026-07-01T09:00:00Z")],
      SPRINT,
      "points",
      AFTER,
    );
    expect(series.flatReason).toBe("ALL_DONE_BEFORE");
  });

  it("reports NO_SIZE when the cohort carries nothing for this unit", () => {
    const series = buildBurndown(
      [issue({ id: "a", status: "TODO", storyPoints: null })],
      [],
      SPRINT,
      "points",
      AFTER,
    );
    expect(series.flatReason).toBe("NO_SIZE");
  });

  it("switching unit can rescue a NO_SIZE sprint", () => {
    const cohort = [issue({ id: "a", status: "DONE", storyPoints: null })];
    const history = [move("a", "TODO", "DONE", "2026-08-06T09:00:00Z")];
    expect(buildBurndown(cohort, history, SPRINT, "points", AFTER).flatReason).toBe("NO_SIZE");
    // Counted as issues it has size, and the line moves.
    expect(buildBurndown(cohort, history, SPRINT, "issues", AFTER).flatReason).toBeNull();
  });

  it("stays null for an empty sprint — that is the empty state, not a flat line", () => {
    expect(buildBurndown([], [], SPRINT, "points", AFTER).flatReason).toBeNull();
  });
});

describe("edge cases that must not produce a misleading chart", () => {
  it("returns an empty series with zero scope for a sprint with no issues", () => {
    const series = buildBurndown([], [], SPRINT, "points", AFTER);
    expect(series.scope).toBe(0);
    expect(series.issueCount).toBe(0);
    expect(series.points).toHaveLength(12);
    expect(series.points.every((p) => p.remaining === 0)).toBe(true);
  });

  it("handles reopened work by burning back up", () => {
    const series = buildBurndown(
      [issue({ id: "a", status: "IN_PROGRESS", storyPoints: 4 })],
      [
        move("a", "TODO", "DONE", "2026-08-05T09:00:00Z"),
        move("a", "DONE", "IN_PROGRESS", "2026-08-08T09:00:00Z"),
      ],
      SPRINT,
      "points",
      AFTER,
    );
    expect(series.points.find((p) => p.day === "2026-08-06")!.remaining).toBe(0);
    expect(series.points.find((p) => p.day === "2026-08-09")!.remaining).toBe(4);
  });

  it("is not fooled by transitions arriving out of order", () => {
    const series = buildBurndown(
      [issue({ id: "a", status: "DONE", storyPoints: 4 })],
      [
        move("a", "IN_PROGRESS", "DONE", "2026-08-09T09:00:00Z"),
        move("a", "TODO", "IN_PROGRESS", "2026-08-04T09:00:00Z"),
      ],
      SPRINT,
      "points",
      AFTER,
    );
    expect(series.points.find((p) => p.day === "2026-08-05")!.remaining).toBe(4);
    expect(series.points.find((p) => p.day === "2026-08-10")!.remaining).toBe(0);
  });

  it("keeps other issues' history out of an issue's replay", () => {
    const series = buildBurndown(
      [issue({ id: "a", status: "TODO", storyPoints: 2 })],
      [move("b", "TODO", "DONE", "2026-08-04T09:00:00Z")],
      SPRINT,
      "points",
      AFTER,
    );
    expect(series.points.every((p) => p.remaining === 2)).toBe(true);
  });
});
