import { describe, expect, it } from "vitest";
import {
  addDays,
  barBox,
  buildAxis,
  buildTicks,
  dayAtX,
  daysBetween,
  isConflict,
  MIN_BAR_PX,
  PX_PER_DAY,
  spanOf,
  startOfDay,
  toDayString,
  unionSpan,
  xFor,
} from "./scale";

// The Timeline's arithmetic (ADR-0047 §8). Gantt bugs are off-by-one-day bugs,
// and an off-by-one you can only reproduce by dragging something in a browser
// is one you will chase for a week. All of it is pure, so all of it is here.

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("days are days, not instants", () => {
  it("collapses any time on a day to that day", () => {
    expect(toDayString(startOfDay(new Date("2026-08-14T23:47:11.000Z")))).toBe("2026-08-14");
  });

  it("counts whole days between two dates", () => {
    expect(daysBetween(day("2026-08-01"), day("2026-08-08"))).toBe(7);
    expect(daysBetween(day("2026-08-08"), day("2026-08-01"))).toBe(-7);
    expect(daysBetween(day("2026-08-01"), day("2026-08-01"))).toBe(0);
  });

  it("crosses a month boundary without drifting", () => {
    expect(toDayString(addDays(day("2026-01-31"), 1))).toBe("2026-02-01");
    expect(daysBetween(day("2026-02-28"), day("2026-03-01"))).toBe(1); // 2026 is not a leap year
  });

  it("survives a DST changeover, because it never leaves UTC", () => {
    // 29 March 2026 is when most of Europe springs forward. In local time that
    // day is 23 hours long, which is exactly how a Gantt loses a column.
    expect(daysBetween(day("2026-03-28"), day("2026-03-30"))).toBe(2);
    expect(toDayString(addDays(day("2026-03-28"), 2))).toBe("2026-03-30");
  });
});

// BR-2, BR-3 — what one date means.
describe("what a row's dates mean", () => {
  it("is null when there is no due date — never an invented position", () => {
    expect(spanOf({ startDate: null, dueDate: null })).toBeNull();
    // Even a start alone is not enough: a bar needs an end, and inventing one
    // would put work on the chart nobody scheduled.
    expect(spanOf({ startDate: "2026-08-01", dueDate: null })).toBeNull();
  });

  it("renders a due date with no start as ONE day on the due date", () => {
    const span = spanOf({ startDate: null, dueDate: "2026-08-14" })!;
    expect(toDayString(span.start)).toBe("2026-08-14");
    expect(toDayString(span.end)).toBe("2026-08-14");
  });

  it("uses both dates when both are set", () => {
    const span = spanOf({ startDate: "2026-08-10", dueDate: "2026-08-14" })!;
    expect(daysBetween(span.start, span.end)).toBe(4);
  });

  it("refuses to draw a negative bar when stored data is already inverted", () => {
    // The API rejects this (BR-4), but a row written before that rule existed
    // must still render something defensible rather than a backwards bar.
    const span = spanOf({ startDate: "2026-08-20", dueDate: "2026-08-14" })!;
    expect(toDayString(span.start)).toBe("2026-08-14");
    expect(toDayString(span.end)).toBe("2026-08-14");
  });
});

// BR-6 — an Epic's bar is the union of its children.
describe("roll-up", () => {
  it("spans the earliest start to the latest end", () => {
    const union = unionSpan([
      { start: day("2026-08-10"), end: day("2026-08-12") },
      { start: day("2026-08-05"), end: day("2026-08-07") },
      { start: day("2026-08-11"), end: day("2026-08-20") },
    ])!;
    expect(toDayString(union.start)).toBe("2026-08-05");
    expect(toDayString(union.end)).toBe("2026-08-20");
  });

  it("is null for an epic with no dated children", () => {
    expect(unionSpan([])).toBeNull();
  });
});

describe("the axis", () => {
  const today = day("2026-08-15");

  it("always contains today, even when every bar is in the past", () => {
    const axis = buildAxis(
      [{ start: day("2026-01-01"), end: day("2026-01-10") }],
      "WEEK",
      today,
    );
    // A Gantt whose "now" marker is off-screen cannot answer the only question
    // anybody brings to it.
    expect(daysBetween(axis.from, today)).toBeGreaterThanOrEqual(0);
    expect(daysBetween(today, axis.to)).toBeGreaterThanOrEqual(0);
  });

  it("contains every bar, with padding", () => {
    const span = { start: day("2026-08-10"), end: day("2026-08-20") };
    const axis = buildAxis([span], "DAY", today);
    expect(axis.from.getTime()).toBeLessThan(span.start.getTime());
    expect(axis.to.getTime()).toBeGreaterThan(span.end.getTime());
  });

  it("never collapses to a useless sliver when there is one one-day bar", () => {
    const axis = buildAxis([{ start: today, end: today }], "DAY", today);
    expect(axis.days).toBeGreaterThanOrEqual(14);
  });

  it("widens with the zoom level, not with the data", () => {
    const spans = [{ start: day("2026-08-01"), end: day("2026-08-31") }];
    const dayAxis = buildAxis(spans, "DAY", today);
    const monthAxis = buildAxis(spans, "MONTH", today);
    expect(dayAxis.pxPerDay).toBe(PX_PER_DAY.DAY);
    expect(monthAxis.pxPerDay).toBe(PX_PER_DAY.MONTH);
    expect(dayAxis.width).toBeGreaterThan(monthAxis.width);
  });
});

// The classic Gantt bug: an inclusive end drawn as if it were exclusive, so
// every bar is one day short and the last day silently vanishes.
describe("bar geometry", () => {
  const today = day("2026-08-15");
  const axis = buildAxis([{ start: day("2026-08-10"), end: day("2026-08-20") }], "DAY", today);

  it("gives a one-day bar a full day of width", () => {
    const box = barBox(axis, { start: day("2026-08-12"), end: day("2026-08-12") });
    expect(box.width).toBe(axis.pxPerDay);
  });

  // The regression that reached production. An issue with a due date and no
  // start IS one day (BR-3), which is the shape of almost all real data — and
  // at Week/Month a one-day bar was 14px/12px: too narrow to grab and too
  // narrow to host resize handles, so resizing was impossible at every zoom
  // but Day. Nothing tested it, so nothing caught it.
  it("never draws a bar too narrow to grab, at any zoom", () => {
    const oneDay = { start: day("2026-08-12"), end: day("2026-08-12") };
    for (const zoom of ["DAY", "WEEK", "MONTH"] as const) {
      const zoomAxis = buildAxis([oneDay], zoom, today);
      expect(barBox(zoomAxis, oneDay).width).toBeGreaterThanOrEqual(MIN_BAR_PX);
    }
  });

  it("leaves long bars alone — the floor is a minimum, not a size", () => {
    const long = { start: day("2026-08-01"), end: day("2026-08-31") };
    const weekAxis = buildAxis([long], "WEEK", today);
    expect(barBox(weekAxis, long).width).toBe(31 * PX_PER_DAY.WEEK);
  });

  it("counts the end day — a 10th-to-14th bar is FIVE days wide, not four", () => {
    const box = barBox(axis, { start: day("2026-08-10"), end: day("2026-08-14") });
    expect(box.width).toBe(5 * axis.pxPerDay);
  });

  it("puts a bar at the offset the axis says", () => {
    const box = barBox(axis, { start: day("2026-08-12"), end: day("2026-08-13") });
    expect(box.left).toBe(daysBetween(axis.from, day("2026-08-12")) * axis.pxPerDay);
    expect(box.left).toBe(xFor(axis, "2026-08-12"));
  });

  it("round-trips pixels back to the same day — the drag's whole job", () => {
    for (const iso of ["2026-08-10", "2026-08-15", "2026-08-22"]) {
      expect(toDayString(dayAtX(axis, xFor(axis, iso)))).toBe(iso);
    }
  });

  it("snaps a half-day drag to the nearer whole day (BR-5)", () => {
    const base = xFor(axis, "2026-08-12");
    expect(toDayString(dayAtX(axis, base + axis.pxPerDay * 0.4))).toBe("2026-08-12");
    expect(toDayString(dayAtX(axis, base + axis.pxPerDay * 0.6))).toBe("2026-08-13");
  });
});

// BR-8 — the bit Jira charges for.
describe("scheduling conflicts", () => {
  const blocker = { start: day("2026-08-10"), end: day("2026-08-20") };

  it("flags a blocker that finishes after its dependent starts", () => {
    expect(isConflict(blocker, { start: day("2026-08-15"), end: day("2026-08-25") })).toBe(true);
  });

  it("does not flag a plan that works", () => {
    expect(isConflict(blocker, { start: day("2026-08-21"), end: day("2026-08-30") })).toBe(false);
  });

  it("allows a same-day hand-off — tight is not impossible", () => {
    // Flagging this would cry wolf on every hand-off, and a warning that fires
    // constantly is one nobody reads.
    expect(isConflict(blocker, { start: day("2026-08-20"), end: day("2026-08-28") })).toBe(false);
  });

  it("says nothing when either end is unscheduled", () => {
    expect(isConflict(null, { start: day("2026-08-01"), end: day("2026-08-02") })).toBe(false);
    expect(isConflict(blocker, null)).toBe(false);
  });
});

describe("axis ticks", () => {
  const today = day("2026-08-15");
  const axis = buildAxis([{ start: day("2026-08-01"), end: day("2026-10-31") }], "MONTH", today);

  it("ticks months at month zoom, not days", () => {
    const ticks = buildTicks(axis, "MONTH");
    // A tick per day at month zoom would be ~90 overlapping labels.
    expect(ticks.length).toBeLessThan(8);
    expect(ticks.every((t) => t.major)).toBe(true);
  });

  it("ticks every day at day zoom, marking week starts", () => {
    const dayAxis = buildAxis([{ start: day("2026-08-03"), end: day("2026-08-16") }], "DAY", today);
    const ticks = buildTicks(dayAxis, "DAY");
    expect(ticks).toHaveLength(dayAxis.days);
    expect(ticks.some((t) => t.major)).toBe(true);
  });
});
