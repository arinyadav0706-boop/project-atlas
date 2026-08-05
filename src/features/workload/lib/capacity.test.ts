import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKING_WEEK,
  LIGHT_WEEKS,
  OVERLOADED_WEEKS,
  describeWorkingWeek,
  loadFraction,
  remainingMinutes,
  weeklyCapacityMinutes,
  weeksOfWork,
  workloadStatus,
} from "./capacity";

// A standard 40h week unless a test says otherwise.
const WEEK_40 = weeklyCapacityMinutes(DEFAULT_WORKING_WEEK);

// The whole workload model is these few functions (ADR-0034), so the edges are
// pinned here rather than only through the service.

describe("remainingMinutes (BR-1)", () => {
  it("subtracts logged time from the estimate", () => {
    expect(remainingMinutes(480, 120)).toBe(360);
  });

  it("is 0 when logged meets the estimate", () => {
    expect(remainingMinutes(480, 480)).toBe(0);
  });

  it("never goes negative when logged overruns the estimate", () => {
    expect(remainingMinutes(60, 600)).toBe(0);
  });

  it("contributes 0 for an unestimated issue — never an imputed default (BR-4)", () => {
    expect(remainingMinutes(null, 300)).toBe(0);
  });

  it("returns the full estimate when nothing is logged", () => {
    expect(remainingMinutes(90, 0)).toBe(90);
  });
});

describe("weeksOfWork (BR-5) is relative to the organization's own week", () => {
  it("treats a full reference week as 1", () => {
    expect(weeksOfWork(WEEK_40, WEEK_40)).toBe(1);
  });

  it("rounds to one decimal for display stability", () => {
    expect(weeksOfWork(360, WEEK_40)).toBe(0.2); // 6h of a 40h week = 0.15 -> 0.2
  });

  it("is 0 for no remaining work", () => {
    expect(weeksOfWork(0, WEEK_40)).toBe(0);
  });

  it("counts the SAME work as less of a week at a 6-day, 8-hour company", () => {
    const week48 = weeklyCapacityMinutes({ minutesPerDay: 480, daysPerWeek: 6 });
    // 40 hours queued: a full week at 5x8, but only ~0.8 of a 6x8 week.
    expect(weeksOfWork(2400, WEEK_40)).toBe(1);
    expect(weeksOfWork(2400, week48)).toBe(0.8);
  });

  it("handles a 9-hour, 5-day company", () => {
    const week45 = weeklyCapacityMinutes({ minutesPerDay: 540, daysPerWeek: 5 });
    expect(week45).toBe(2700);
    expect(weeksOfWork(2700, week45)).toBe(1);
  });
});

describe("weeklyCapacityMinutes", () => {
  it("multiplies the day by the week", () => {
    expect(weeklyCapacityMinutes({ minutesPerDay: 480, daysPerWeek: 6 })).toBe(2880);
  });

  it("falls back rather than dividing by zero on a misconfigured org", () => {
    expect(weeklyCapacityMinutes({ minutesPerDay: 0, daysPerWeek: 0 })).toBe(2400);
  });
});

describe("describeWorkingWeek states the basis of every number", () => {
  it("describes a 40-hour week", () => {
    expect(describeWorkingWeek(DEFAULT_WORKING_WEEK)).toBe("8h × 5 days = 40h week");
  });

  it("describes a 6-day week", () => {
    expect(describeWorkingWeek({ minutesPerDay: 480, daysPerWeek: 6 })).toBe(
      "8h × 6 days = 48h week",
    );
  });

  it("describes a half-hour day without lying about precision", () => {
    expect(describeWorkingWeek({ minutesPerDay: 450, daysPerWeek: 5 })).toBe(
      "7.5h × 5 days = 37.5h week",
    );
  });
});

describe("workloadStatus (BR-6)", () => {
  it("is IDLE only when nothing is open, even with zero effort", () => {
    expect(workloadStatus(0, 0)).toBe("IDLE");
  });

  it("distinguishes 'open but unestimated' from idle", () => {
    // 5 open issues, none estimated -> 0 weeks, but NOT idle.
    expect(workloadStatus(0, 5)).toBe("LIGHT");
  });

  it("is LIGHT below the half-week line", () => {
    expect(workloadStatus(LIGHT_WEEKS - 0.1, 3)).toBe("LIGHT");
  });

  it("is BALANCED from the light line up to the overloaded line inclusive", () => {
    expect(workloadStatus(LIGHT_WEEKS, 3)).toBe("BALANCED");
    expect(workloadStatus(OVERLOADED_WEEKS, 3)).toBe("BALANCED");
  });

  it("is OVERLOADED only beyond two weeks", () => {
    expect(workloadStatus(OVERLOADED_WEEKS + 0.1, 3)).toBe("OVERLOADED");
  });
});

describe("loadFraction", () => {
  it("fills the bar at the overloaded line", () => {
    expect(loadFraction(OVERLOADED_WEEKS)).toBe(1);
  });

  it("clamps beyond the line rather than overflowing", () => {
    expect(loadFraction(10)).toBe(1);
  });

  it("is half-full at one week", () => {
    expect(loadFraction(1)).toBe(0.5);
  });

  it("never goes negative", () => {
    expect(loadFraction(-3)).toBe(0);
  });
});
