import { describe, expect, it } from "vitest";
import { findProblems, isOvertime, planDays, resolveBillable, type ProblemRow } from "./rules";
import { addDays, deadlineFor, isIsoDate, periodStartFor, todayIn, zonedTimeToUtc } from "./period";

// docs/02_Modules/37_timesheets.md — BR-3, BR-10, BR-13–BR-16, BR-24.

describe("periods (BR-1, BR-3)", () => {
  it("finds the period start for any weekday and week-start day", () => {
    expect(periodStartFor("2026-11-19", 1)).toBe("2026-11-16"); // Thu → Monday
    expect(periodStartFor("2026-11-16", 1)).toBe("2026-11-16"); // Monday itself
    expect(periodStartFor("2026-11-22", 1)).toBe("2026-11-16"); // Sunday → previous Monday
    expect(periodStartFor("2026-11-19", 0)).toBe("2026-11-15"); // Sunday-start week
  });

  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-11-16")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("16/11/2026")).toBe(false);
  });

  it("puts the default deadline on the Monday after the week, 11:00 in the policy timezone", () => {
    const due = deadlineFor("2026-11-22", { dueWeekday: 1, dueTime: "11:00", timezone: "Asia/Kolkata" });
    expect(due.toISOString()).toBe("2026-11-23T05:30:00.000Z"); // 11:00 IST
    const utc = deadlineFor("2026-11-22", { dueWeekday: 1, dueTime: "11:00", timezone: "UTC" });
    expect(utc.toISOString()).toBe("2026-11-23T11:00:00.000Z");
  });

  it("converts wall-clock time across a DST change", () => {
    // London leaves summer time on 25 Oct 2026; 09:00 the next day is GMT.
    expect(zonedTimeToUtc("2026-10-26", "09:00", "Europe/London").toISOString()).toBe("2026-10-26T09:00:00.000Z");
    expect(zonedTimeToUtc("2026-10-23", "09:00", "Europe/London").toISOString()).toBe("2026-10-23T08:00:00.000Z");
  });

  it("reads today in the organization's timezone, not the server's", () => {
    const now = new Date("2026-11-16T20:00:00.000Z"); // already the 17th in India
    expect(todayIn("Asia/Kolkata", now)).toBe("2026-11-17");
    expect(todayIn("UTC", now)).toBe("2026-11-16");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("billable resolution (BR-10)", () => {
  const none = {
    override: null,
    issueDefault: null,
    activityDefault: null,
    projectDefault: null,
    clientDefault: null,
    policyDefault: false,
  };
  it("takes the first value set: override → issue/activity → project → client → policy", () => {
    expect(resolveBillable(none)).toBe(false);
    expect(resolveBillable({ ...none, policyDefault: true })).toBe(true);
    expect(resolveBillable({ ...none, clientDefault: true })).toBe(true);
    expect(resolveBillable({ ...none, clientDefault: true, projectDefault: false })).toBe(false);
    expect(resolveBillable({ ...none, projectDefault: false, issueDefault: true })).toBe(true);
    expect(resolveBillable({ ...none, activityDefault: false, clientDefault: true })).toBe(false);
    expect(resolveBillable({ ...none, issueDefault: true, override: false })).toBe(false);
  });
});

describe("expected minutes (BR-13, BR-14)", () => {
  const week = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"];
  const base = {
    days: week,
    weekStartDay: 1,
    workingMinutesPerDay: 480,
    workingDaysPerWeek: 5,
    holidays: new Map([["2026-11-20", "Gurpurab"]]),
    leave: new Map([["2026-11-19", { minutes: 480, type: "Leave" }]]),
  };

  it("ignores leave and holidays when HR is not connected — a full working week", () => {
    const plan = planDays({ ...base, hrConnected: false });
    expect(plan.map((d) => d.kind)).toEqual(["WORKING", "WORKING", "WORKING", "WORKING", "WORKING", "WEEKEND", "WEEKEND"]);
    expect(plan.reduce((s, d) => s + d.expectedMinutes, 0)).toBe(2400);
  });

  it("subtracts a holiday and approved leave when HR is connected", () => {
    const plan = planDays({ ...base, hrConnected: true });
    expect(plan[3]).toMatchObject({ kind: "LEAVE", label: "Leave", expectedMinutes: 0 });
    expect(plan[4]).toMatchObject({ kind: "HOLIDAY", label: "Gurpurab", expectedMinutes: 0 });
    expect(plan.reduce((s, d) => s + d.expectedMinutes, 0)).toBe(1440); // 3 × 8h
  });

  it("makes a half-day leave exact", () => {
    const plan = planDays({ ...base, hrConnected: true, leave: new Map([["2026-11-17", { minutes: 240, type: "Half day" }]]) });
    expect(plan[1]!.expectedMinutes).toBe(240);
  });

  it("supports a six-day week", () => {
    const plan = planDays({ ...base, hrConnected: false, workingDaysPerWeek: 6 });
    expect(plan.filter((d) => d.kind === "WORKING")).toHaveLength(6);
  });

  it("flags overtime above the threshold, defaulting to the working day (BR-15)", () => {
    expect(isOvertime(600, null, 480)).toBe(true);
    expect(isOvertime(480, null, 480)).toBe(false);
    expect(isOvertime(600, 600, 480)).toBe(false);
  });
});

describe("submit problems (BR-24)", () => {
  const row = (over: Partial<ProblemRow> = {}): ProblemRow => ({
    id: "r1",
    label: "ATL-142 Board filters",
    isActivity: false,
    billable: false,
    activityNotesRequired: false,
    requiresProject: false,
    requiresClient: false,
    hasProject: false,
    hasClient: false,
    cells: [{ date: "2026-11-16", minutes: 60, notes: [null] }],
    ...over,
  });
  const input = { notesRequired: "NONE" as const, enforceClientRequirement: true };

  it("passes a normal week", () => {
    expect(findProblems({ ...input, rows: [row()] })).toEqual([]);
  });

  it("blocks an empty week", () => {
    expect(findProblems({ ...input, rows: [] }).map((p) => p.code)).toEqual(["EMPTY_WEEK"]);
    expect(findProblems({ ...input, rows: [row({ cells: [{ date: "2026-11-16", minutes: 0, notes: [] }] })] }).map((p) => p.code)).toEqual(["EMPTY_WEEK"]);
  });

  it("points a missing required note at its cell", () => {
    const problems = findProblems({
      ...input,
      rows: [row({ id: "cm", label: "Client meeting", isActivity: true, activityNotesRequired: true, cells: [{ date: "2026-11-17", minutes: 60, notes: [null] }] })],
    });
    expect(problems).toEqual([
      { code: "NOTE_REQUIRED", message: "Client meeting → Tue, 17 Nov", rowId: "cm", date: "2026-11-17" },
    ]);
  });

  it("applies the policy's notes rule to billable lines only, or to all", () => {
    const billable = row({ billable: true });
    expect(findProblems({ ...input, notesRequired: "BILLABLE", rows: [billable] }).map((p) => p.code)).toEqual(["NOTE_REQUIRED"]);
    expect(findProblems({ ...input, notesRequired: "BILLABLE", rows: [row()] })).toEqual([]);
    expect(findProblems({ ...input, notesRequired: "ALL", rows: [row()] }).map((p) => p.code)).toEqual(["NOTE_REQUIRED"]);
  });

  it("points a missing required project or client at its row", () => {
    const r = row({ isActivity: true, requiresProject: true, requiresClient: true });
    expect(findProblems({ ...input, rows: [r] }).map((p) => [p.code, p.rowId, p.date])).toEqual([
      ["PROJECT_REQUIRED", "r1", null],
      ["CLIENT_REQUIRED", "r1", null],
    ]);
  });

  it("does not enforce the client requirement while it is switched off (ADR-0059 Q14)", () => {
    const r = row({ isActivity: true, requiresClient: true });
    expect(findProblems({ ...input, enforceClientRequirement: false, rows: [r] })).toEqual([]);
  });

  it("blocks a day over 24h across rows", () => {
    const a = row({ id: "a", cells: [{ date: "2026-11-18", minutes: 900, notes: [null] }] });
    const b = row({ id: "b", cells: [{ date: "2026-11-18", minutes: 600, notes: [null] }] });
    expect(findProblems({ ...input, rows: [a, b] }).map((p) => [p.code, p.date])).toEqual([["DAY_OVER_24H", "2026-11-18"]]);
  });
});
