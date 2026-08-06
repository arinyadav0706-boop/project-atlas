import { describe, expect, it } from "vitest";
import { resolveWindow } from "./resolve-window";
import type { SchedulableIssue } from "@/features/scheduling/types/scheduling.types";

// The resolution chain is the contract every date-driven view will inherit
// (ADR-0035 §2), so precedence and the two today-relative adjustments are
// pinned here rather than only through the workload service.

// A Thursday, so "clamp to today" and week boundaries are both exercised.
const NOW = new Date("2026-08-06T09:30:00.000Z");
const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function issue(over: Partial<SchedulableIssue> = {}): SchedulableIssue {
  return { startDate: null, dueDate: null, sprintStartDate: null, sprintEndDate: null, ...over };
}

describe("resolveWindow precedence (Jira: an explicit date beats an inferred one)", () => {
  it("prefers the issue's own range over everything", () => {
    const w = resolveWindow(
      issue({
        startDate: utc("2026-08-10"),
        dueDate: utc("2026-08-20"),
        sprintStartDate: utc("2026-08-03"),
        sprintEndDate: utc("2026-08-14"),
      }),
      NOW,
    );
    expect(w).toEqual({
      kind: "SCHEDULED",
      from: utc("2026-08-10"),
      to: utc("2026-08-20"),
      source: "ISSUE_DATES",
    });
  });

  it("prefers a due date over the sprint window", () => {
    const w = resolveWindow(
      issue({
        dueDate: utc("2026-08-20"),
        sprintStartDate: utc("2026-08-03"),
        sprintEndDate: utc("2026-08-14"),
      }),
      NOW,
    );
    expect(w).toMatchObject({ kind: "SCHEDULED", source: "DUE_ONLY", to: utc("2026-08-20") });
  });

  it("falls back to the sprint window when the issue carries no dates", () => {
    const w = resolveWindow(
      issue({ sprintStartDate: utc("2026-08-03"), sprintEndDate: utc("2026-08-14") }),
      NOW,
    );
    expect(w).toMatchObject({ kind: "SCHEDULED", source: "SPRINT_DATES", to: utc("2026-08-14") });
  });

  it("is UNSCHEDULED with no dates anywhere — not an error, a finding", () => {
    expect(resolveWindow(issue(), NOW)).toEqual({ kind: "UNSCHEDULED" });
  });

  it("ignores a half-set sprint window", () => {
    expect(resolveWindow(issue({ sprintStartDate: utc("2026-08-03") }), NOW)).toEqual({
      kind: "UNSCHEDULED",
    });
    expect(resolveWindow(issue({ sprintEndDate: utc("2026-08-14") }), NOW)).toEqual({
      kind: "UNSCHEDULED",
    });
  });

  it("ignores a start date with no due date — a one-ended range spreads nowhere", () => {
    expect(resolveWindow(issue({ startDate: utc("2026-08-03") }), NOW)).toEqual({
      kind: "UNSCHEDULED",
    });
  });
});

describe("a due date with no start date spreads from today (Asana's rule)", () => {
  it("starts the window at today, not at the due week", () => {
    const w = resolveWindow(issue({ dueDate: utc("2026-08-28") }), NOW);
    expect(w).toMatchObject({ kind: "SCHEDULED", from: utc("2026-08-06") });
  });

  it("keeps a same-day deadline as a single-day window", () => {
    const w = resolveWindow(issue({ dueDate: utc("2026-08-06") }), NOW);
    expect(w).toMatchObject({ kind: "SCHEDULED", from: utc("2026-08-06"), to: utc("2026-08-06") });
  });
});

describe("windows are clamped to today — effort cannot be scheduled into the past", () => {
  it("clamps a sprint that started three days ago", () => {
    const w = resolveWindow(
      issue({ sprintStartDate: utc("2026-08-03"), sprintEndDate: utc("2026-08-14") }),
      NOW,
    );
    expect(w).toMatchObject({ from: utc("2026-08-06"), to: utc("2026-08-14") });
  });

  it("leaves a future window alone", () => {
    const w = resolveWindow(
      issue({ sprintStartDate: utc("2026-08-17"), sprintEndDate: utc("2026-08-28") }),
      NOW,
    );
    expect(w).toMatchObject({ from: utc("2026-08-17") });
  });
});

describe("a closed window is Overdue, and remembers where its dates came from", () => {
  it("sends a missed due date to Overdue", () => {
    expect(resolveWindow(issue({ dueDate: utc("2026-08-05") }), NOW)).toEqual({
      kind: "OVERDUE",
      source: "DUE_ONLY",
    });
  });

  it("sends work still open in a sprint that already ended to Overdue", () => {
    expect(
      resolveWindow(
        issue({ sprintStartDate: utc("2026-07-20"), sprintEndDate: utc("2026-07-31") }),
        NOW,
      ),
    ).toEqual({ kind: "OVERDUE", source: "SPRINT_DATES" });
  });

  it("treats a deadline earlier today as still due today, not overdue", () => {
    // The due date is midnight this morning; the clock says 09:30. Day
    // granularity is the promise, so this is today's work, not late work.
    expect(resolveWindow(issue({ dueDate: utc("2026-08-06") }), NOW)).toMatchObject({
      kind: "SCHEDULED",
    });
  });
});
