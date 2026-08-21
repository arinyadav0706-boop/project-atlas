import { describe, expect, it } from "vitest";
import { toDayString } from "@/shared/lib/day";
import {
  buildCalendar,
  buildWeeks,
  DAYS_PER_WEEK,
  MAX_LANES_PER_DAY,
  monthWindow,
  packLanes,
  weekWindow,
} from "./grid";

// The Calendar's layout (ADR-0048 §3). Calendars fail in two ways — an item in
// the wrong cell, and two items drawn on top of each other — and both are cheap
// here and expensive in a rendered grid.

const day = (s: string) => new Date(`${s}T00:00:00.000Z`);
const item = (id: string, startDate: string | null, dueDate: string | null) => ({
  id,
  startDate,
  dueDate,
});

describe("the month window", () => {
  it("starts on the Monday on or before the 1st and always draws six weeks", () => {
    // 1 August 2026 is a Saturday, so the grid opens on Monday 27 July.
    const w = monthWindow(day("2026-08-14"));
    expect(toDayString(w.from)).toBe("2026-07-27");
    expect(buildWeeks(w.from, w.to)).toHaveLength(6);
  });

  it("draws six weeks even for a month that fits in five", () => {
    // A grid that is five rows one month and six the next jumps under the
    // cursor every time you page.
    for (const anchor of ["2026-02-10", "2026-03-10", "2026-11-10", "2027-02-10"]) {
      const w = monthWindow(day(anchor));
      expect(buildWeeks(w.from, w.to)).toHaveLength(6);
    }
  });

  it("starts the week on Monday, not Sunday (BR-10)", () => {
    const w = monthWindow(day("2026-08-14"));
    expect(w.from.getUTCDay()).toBe(1);
  });

  it("gives the week view exactly seven days around the date", () => {
    const w = weekWindow(day("2026-08-14")); // a Friday
    expect(toDayString(w.from)).toBe("2026-08-10");
    expect(toDayString(w.to)).toBe("2026-08-16");
  });
});

describe("placing an item on the grid", () => {
  const { from, to } = monthWindow(day("2026-08-14"));

  it("puts a one-day issue in exactly one cell, one column wide (BR-2)", () => {
    const weeks = buildCalendar([item("a", null, "2026-08-12")], from, to);
    const segs = weeks.flatMap((w) => w.segments);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.length).toBe(1);
    // 12 August 2026 is a Wednesday — column 2 counting Monday as 0.
    expect(segs[0]!.startCol).toBe(2);
  });

  it("draws a five-day issue as ONE bar five columns wide, not five bars (BR-3)", () => {
    const weeks = buildCalendar([item("a", "2026-08-10", "2026-08-14")], from, to);
    const segs = weeks.flatMap((w) => w.segments);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.length).toBe(5);
    expect(segs[0]!.continuesBefore).toBe(false);
    expect(segs[0]!.continuesAfter).toBe(false);
  });

  it("cuts an issue that crosses a week boundary into one segment per row", () => {
    // Friday 14th to Tuesday 18th: 14–16 in one row, 17–18 in the next.
    const weeks = buildCalendar([item("a", "2026-08-14", "2026-08-18")], from, to);
    const segs = weeks.flatMap((w) => w.segments);
    expect(segs).toHaveLength(2);
    expect(segs[0]).toMatchObject({ startCol: 4, endCol: 6, continuesAfter: true });
    expect(segs[1]).toMatchObject({ startCol: 0, endCol: 1, continuesBefore: true });
  });

  it("keeps a Monday-to-Monday issue in TWO rows, not twice in the first", () => {
    // Both segments start at column 0, which is exactly the case that breaks a
    // grid that matches a segment back to its week by weekday.
    const weeks = buildCalendar([item("a", "2026-08-10", "2026-08-17")], from, to);
    const rowsWithSegments = weeks.filter((w) => w.segments.length > 0);
    expect(rowsWithSegments).toHaveLength(2);
    expect(rowsWithSegments.every((w) => w.segments.length === 1)).toBe(true);
  });

  it("ignores an issue with no due date — never a guessed cell (BR-1)", () => {
    const weeks = buildCalendar(
      [item("a", null, null), item("b", "2026-08-10", null)],
      from,
      to,
    );
    expect(weeks.flatMap((w) => w.segments)).toHaveLength(0);
  });

  it("ignores an issue outside the window entirely", () => {
    const weeks = buildCalendar([item("a", null, "2025-01-01")], from, to);
    expect(weeks.flatMap((w) => w.segments)).toHaveLength(0);
  });

  it("clips an issue that starts before the window to the first cell drawn", () => {
    const weeks = buildCalendar([item("a", "2026-06-01", "2026-07-28")], from, to);
    const segs = weeks.flatMap((w) => w.segments);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.startCol).toBe(0);
    expect(segs[0]!.continuesBefore).toBe(true);
  });
});

// BR-4 — the bit that stops the grid looking like a pile.
describe("lane packing", () => {
  const seg = (id: string, startCol: number, endCol: number) => ({
    item: { id, startDate: null, dueDate: null },
    startCol,
    endCol,
    length: endCol - startCol + 1,
    continuesBefore: false,
    continuesAfter: false,
  });

  it("gives overlapping items different lanes", () => {
    const { placed } = packLanes([seg("a", 0, 3), seg("b", 2, 5)]);
    expect(new Set(placed.map((p) => p.lane)).size).toBe(2);
  });

  it("reuses a lane for items that do not touch", () => {
    // Two short bars either end of the week belong on the same line; wasting a
    // lane on each is how a calendar runs out of room for no reason.
    const { placed } = packLanes([seg("a", 0, 1), seg("b", 4, 6)]);
    expect(placed.every((p) => p.lane === 0)).toBe(true);
  });

  it("packs the longest bar first so it is not stranded under short ones", () => {
    const { placed } = packLanes([seg("short", 3, 3), seg("long", 0, 6)]);
    const long = placed.find((p) => p.item.id === "long")!;
    const short = placed.find((p) => p.item.id === "short")!;
    expect(long.lane).toBe(0);
    expect(short.lane).toBe(1);
  });

  it("is stable — the same input always gives the same grid", () => {
    // An unrelated re-render must not reshuffle rows under someone's cursor.
    const input = [seg("c", 0, 2), seg("a", 0, 2), seg("b", 0, 2)];
    const first = packLanes(input).placed.map((p) => `${p.item.id}:${p.lane}`);
    const shuffled = [input[2]!, input[0]!, input[1]!];
    expect(packLanes(shuffled).placed.map((p) => `${p.item.id}:${p.lane}`)).toEqual(first);
  });

  it("caps the lanes and counts the rest as per-day overflow (BR-5)", () => {
    const extra = 2;
    const segs = Array.from({ length: MAX_LANES_PER_DAY + extra }, (_, i) =>
      seg(`x${i}`, 2, 2),
    );
    const { placed, overflow } = packLanes(segs);
    expect(placed).toHaveLength(MAX_LANES_PER_DAY);
    expect(overflow[2]).toBe(extra);
    // Only the crowded day overflows — a busy Wednesday must not put "+2 more"
    // on an empty Friday.
    expect(overflow.filter((n) => n > 0)).toHaveLength(1);
  });

  it("counts an overflowing multi-day bar on every day it would have covered", () => {
    // Fill every lane across the whole week, then add one more that cannot fit.
    const segs = [
      ...Array.from({ length: MAX_LANES_PER_DAY }, (_, i) => seg(`block${i}`, 0, 6)),
      seg("pushed-out", 1, 3),
    ];
    const { overflow } = packLanes(segs);
    expect(overflow).toEqual([0, 1, 1, 1, 0, 0, 0]);
  });

  it("has one entry per weekday, always", () => {
    expect(packLanes([]).overflow).toHaveLength(DAYS_PER_WEEK);
  });

  // Pins the VALUE, not just the symbol. Every other test here reads
  // MAX_LANES_PER_DAY, so they all passed unchanged while the cap sat at 4 and
  // the grid was hiding 94.6% of a real project behind "+N more". A test that
  // moves with the constant cannot tell you the constant is wrong.
  it("draws enough per day to be a calendar, not a summary", () => {
    expect(MAX_LANES_PER_DAY).toBeGreaterThanOrEqual(10);
  });

  it("shows a realistic day in full rather than collapsing it", () => {
    // Ten issues due the same Wednesday is an ordinary Tuesday-afternoon
    // situation on a real project. All ten belong on the grid.
    const segs = Array.from({ length: 10 }, (_, i) => seg(`x${i}`, 2, 2));
    const { placed, overflow } = packLanes(segs);
    expect(placed).toHaveLength(10);
    expect(overflow.every((n) => n === 0)).toBe(true);
  });
});

describe("what the grid guarantees end to end", () => {
  const { from, to } = monthWindow(day("2026-08-14"));

  it("never draws two segments in the same lane on the same day", () => {
    const items = [
      item("a", "2026-08-03", "2026-08-07"),
      item("b", "2026-08-05", "2026-08-05"),
      item("c", "2026-08-06", "2026-08-11"),
      item("d", null, "2026-08-06"),
      item("e", "2026-08-04", "2026-08-04"),
    ];
    for (const week of buildCalendar(items, from, to)) {
      const taken = new Set<string>();
      for (const s of week.segments) {
        for (let c = s.startCol; c <= s.endCol; c++) {
          const cell = `${s.lane}:${c}`;
          expect(taken.has(cell)).toBe(false);
          taken.add(cell);
        }
      }
    }
  });

  it("survives a DST changeover without shifting a column", () => {
    // 29 March 2026 is when most of Europe springs forward — in local time that
    // day is 23 hours long, which is exactly how a calendar loses a column.
    const w = monthWindow(day("2026-03-15"));
    const weeks = buildCalendar([item("a", "2026-03-27", "2026-03-31")], w.from, w.to);
    const segs = weeks.flatMap((s) => s.segments);
    expect(segs.reduce((n, s) => n + s.length, 0)).toBe(5);
  });
});
