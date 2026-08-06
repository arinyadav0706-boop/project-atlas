import { describe, expect, it } from "vitest";
import { distributeAcrossWeeks, roundToTotal } from "./distribute";
import { buildHorizon, countWorkingDays, formatWeekLabel, startOfUtcWeek } from "./weeks";

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// Mon 3 Aug 2026 starts the horizon used throughout: Aug 3, 10, 17, 24.
const HORIZON = buildHorizon(utc("2026-08-06"), 4);
const FIVE_DAY = 5;

const sum = (d: { weeks: number[]; later: number }) =>
  d.weeks.reduce((a, b) => a + b, 0) + d.later;

describe("week arithmetic is UTC and Monday-start", () => {
  it("snaps a Thursday back to its Monday", () => {
    expect(startOfUtcWeek(utc("2026-08-06"))).toEqual(utc("2026-08-03"));
  });

  it("keeps Sunday in the week that just ended, not the one starting", () => {
    expect(startOfUtcWeek(utc("2026-08-09"))).toEqual(utc("2026-08-03"));
    expect(startOfUtcWeek(utc("2026-08-10"))).toEqual(utc("2026-08-10"));
  });

  it("builds consecutive week starts from the containing week", () => {
    expect(HORIZON).toEqual([
      utc("2026-08-03"),
      utc("2026-08-10"),
      utc("2026-08-17"),
      utc("2026-08-24"),
    ]);
  });
});

describe("countWorkingDays", () => {
  it("counts a Mon–Fri week as five days at a five-day company", () => {
    expect(countWorkingDays(utc("2026-08-03"), utc("2026-08-09"), 5)).toBe(5);
  });

  it("counts the same week as six at a six-day company", () => {
    expect(countWorkingDays(utc("2026-08-03"), utc("2026-08-09"), 6)).toBe(6);
  });

  it("skips the weekend inside a range", () => {
    // Fri 7th to Mon 10th: Friday and Monday only.
    expect(countWorkingDays(utc("2026-08-07"), utc("2026-08-10"), 5)).toBe(2);
  });

  it("is zero for a weekend-only range at a five-day company", () => {
    expect(countWorkingDays(utc("2026-08-08"), utc("2026-08-09"), 5)).toBe(0);
  });

  it("is zero for an inverted range", () => {
    expect(countWorkingDays(utc("2026-08-10"), utc("2026-08-03"), 5)).toBe(0);
  });

  it("handles long ranges without walking them", () => {
    // A full 52-week year from a Monday: 52 × 5.
    expect(countWorkingDays(utc("2026-08-03"), utc("2027-08-01"), 5)).toBe(260);
  });
});

describe("formatWeekLabel shows real dates, never '+2 wk'", () => {
  it("labels a week inside one month", () => {
    expect(formatWeekLabel(utc("2026-08-03"), 5)).toBe("Aug 3–7");
  });

  it("labels a week that crosses a month boundary", () => {
    expect(formatWeekLabel(utc("2026-08-31"), 5)).toBe("Aug 31–Sep 4");
  });

  it("extends the label to Saturday at a six-day company", () => {
    expect(formatWeekLabel(utc("2026-08-03"), 6)).toBe("Aug 3–8");
  });
});

describe("roundToTotal keeps the grid's headline promise", () => {
  it("distributes leftover minutes so the parts sum to the whole", () => {
    const out = roundToTotal([3.34, 3.33, 3.33], 10);
    expect(out.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("gives the leftover to the largest fractional shares first", () => {
    expect(roundToTotal([1.9, 1.05, 1.05], 4)).toEqual([2, 1, 1]);
  });

  it("is exact for an awkward split across four weeks", () => {
    const out = roundToTotal([2.5, 2.5, 2.5, 2.5], 10);
    expect(out.reduce((a, b) => a + b, 0)).toBe(10);
  });
});

describe("distributeAcrossWeeks spreads over working days (ClickUp's rule)", () => {
  it("puts a single week's work in a single column", () => {
    const d = distributeAcrossWeeks(
      { from: utc("2026-08-03"), to: utc("2026-08-07") },
      1000,
      HORIZON,
      FIVE_DAY,
    );
    expect(d.weeks).toEqual([1000, 0, 0, 0]);
    expect(d.later).toBe(0);
  });

  it("splits evenly across two whole weeks", () => {
    const d = distributeAcrossWeeks(
      { from: utc("2026-08-03"), to: utc("2026-08-14") },
      1000,
      HORIZON,
      FIVE_DAY,
    );
    expect(d.weeks).toEqual([500, 500, 0, 0]);
  });

  it("weights partial weeks by their working days", () => {
    // Thu 6th to Tue 11th: 2 working days this week, 2 next week.
    const d = distributeAcrossWeeks(
      { from: utc("2026-08-06"), to: utc("2026-08-11") },
      1000,
      HORIZON,
      FIVE_DAY,
    );
    expect(d.weeks).toEqual([500, 500, 0, 0]);
  });

  it("ignores weekend days when splitting", () => {
    // Fri 7th to Mon 10th spans four calendar days but two working ones.
    const d = distributeAcrossWeeks(
      { from: utc("2026-08-07"), to: utc("2026-08-10") },
      100,
      HORIZON,
      FIVE_DAY,
    );
    expect(d.weeks).toEqual([50, 50, 0, 0]);
  });

  it("counts Saturday at a six-day company", () => {
    const d = distributeAcrossWeeks(
      { from: utc("2026-08-07"), to: utc("2026-08-10") },
      300,
      HORIZON,
      6,
    );
    // Fri + Sat this week, Mon next: two thirds then one third.
    expect(d.weeks).toEqual([200, 100, 0, 0]);
  });
});

describe("effort past the horizon lands in Later, never nowhere", () => {
  it("carries the overflow of a long task", () => {
    // Eight weeks of window against a four-week horizon: half is beyond it.
    const d = distributeAcrossWeeks(
      { from: utc("2026-08-03"), to: utc("2026-09-25") },
      800,
      HORIZON,
      FIVE_DAY,
    );
    expect(d.weeks).toEqual([100, 100, 100, 100]);
    expect(d.later).toBe(400);
  });

  it("puts a window entirely past the horizon wholly in Later", () => {
    const d = distributeAcrossWeeks(
      { from: utc("2026-10-05"), to: utc("2026-10-09") },
      500,
      HORIZON,
      FIVE_DAY,
    );
    expect(d.weeks).toEqual([0, 0, 0, 0]);
    expect(d.later).toBe(500);
  });
});

describe("the totals invariant: columns always sum to the person's number", () => {
  const cases: Array<[string, string, number]> = [
    ["2026-08-06", "2026-08-06", 7],
    ["2026-08-06", "2026-08-31", 1234],
    ["2026-08-03", "2027-02-01", 999],
    ["2026-08-08", "2026-08-09", 61],
    ["2026-08-06", "2026-08-20", 1],
  ];

  it.each(cases)("holds for %s → %s of %i minutes", (from, to, minutes) => {
    const d = distributeAcrossWeeks({ from: utc(from), to: utc(to) }, minutes, HORIZON, FIVE_DAY);
    expect(sum(d)).toBe(minutes);
    expect([...d.weeks, d.later].every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
  });

  it("holds for a weekend-only window, which has no working days at all", () => {
    // Sat 8th to Sun 9th at a five-day company: nothing is droppable, so the
    // whole estimate sits in the week the deadline falls in.
    const d = distributeAcrossWeeks(
      { from: utc("2026-08-08"), to: utc("2026-08-09") },
      480,
      HORIZON,
      FIVE_DAY,
    );
    expect(d.weeks).toEqual([480, 0, 0, 0]);
    expect(sum(d)).toBe(480);
  });

  it("contributes nothing for an unestimated issue", () => {
    const d = distributeAcrossWeeks(
      { from: utc("2026-08-06"), to: utc("2026-08-20") },
      0,
      HORIZON,
      FIVE_DAY,
    );
    expect(sum(d)).toBe(0);
  });
});
