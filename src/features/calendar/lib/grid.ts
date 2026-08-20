// The Calendar's layout arithmetic, as a pure module (ADR-0048 §3).
//
// No React, no DOM, no fetch. Calendars fail in exactly two ways — an item in
// the wrong cell (off-by-one-day) and two items drawn on top of each other
// (lane packing) — and both are cheap to test here and expensive to chase in a
// rendered grid.

import {
  addDays,
  daysBetween,
  spanOf,
  startOfDay,
  startOfMonth,
  startOfWeek,
  toDayString,
  weekdayIndex,
  type Span,
} from "@/shared/lib/day";

export const DAYS_PER_WEEK = 7;

/**
 * Bars drawn in a day cell before the rest collapse into "+N more" (BR-5).
 *
 * Four is what fits at the row height a six-week month needs. Without a cap,
 * one busy Tuesday makes its whole week row 400px tall and the month stops
 * being a month.
 */
export const MAX_LANES_PER_DAY = 4;

/**
 * The same cap for the week view, which draws ONE row and therefore has the
 * vertical room a month grid does not.
 *
 * Using the month's cap here would collapse a week that fits comfortably into
 * "+31 more" under four bars, in a view whose entire purpose is to show the
 * week in full.
 */
export const MAX_LANES_PER_WEEK_VIEW = 14;

/** Anything schedulable enough to draw. */
export interface CalendarItem {
  id: string;
  startDate: string | null;
  dueDate: string | null;
}

/** One week row of the grid: seven days, Monday first. */
export interface WeekRow {
  /** Monday of this row. */
  start: Date;
  /** Sunday of this row. */
  end: Date;
  days: Date[];
}

/**
 * One item's presence in ONE week row.
 *
 * An issue spanning a week boundary produces several of these — one per row —
 * rather than one impossible bar wrapping around the end of a line. Each knows
 * whether it is cut, so the UI can point an arrow at the part off-screen.
 */
export interface Segment<T> {
  item: T;
  /** Column of the first day covered, 0–6 from Monday. */
  startCol: number;
  /** Inclusive column of the last day covered, 0–6. */
  endCol: number;
  /** Columns covered — always at least 1 (BR-2: one day is one column). */
  length: number;
  /** The item began before this week row. */
  continuesBefore: boolean;
  /** The item ends after this week row. */
  continuesAfter: boolean;
  /** Vertical slot within the row, 0-based. Assigned by `packLanes`. */
  lane: number;
}

export interface CalendarWeek<T> {
  row: WeekRow;
  /** Segments that fit within `MAX_LANES_PER_DAY`. */
  segments: Segment<T>[];
  /**
   * Per-day count of what did NOT fit, indexed by column. The "+N more" (BR-5).
   */
  overflow: number[];
}

/**
 * The six-week window a month view draws.
 *
 * Always whole weeks and always the same height: a grid that is five rows in
 * February and six in March jumps under the cursor every time you page, and a
 * calendar you cannot build muscle memory on is a calendar people stop using.
 */
export function monthWindow(anyDayInMonth: Date): { from: Date; to: Date } {
  const from = startOfWeek(startOfMonth(anyDayInMonth));
  return { from, to: addDays(from, 6 * DAYS_PER_WEEK - 1) };
}

/** The window a week view draws — the Monday-to-Sunday `date` falls in. */
export function weekWindow(date: Date): { from: Date; to: Date } {
  const from = startOfWeek(date);
  return { from, to: addDays(from, DAYS_PER_WEEK - 1) };
}

/** Whole week rows covering `from`…`to` inclusive. */
export function buildWeeks(from: Date, to: Date): WeekRow[] {
  const rows: WeekRow[] = [];
  let cursor = startOfWeek(from);
  const last = startOfDay(to);
  while (cursor.getTime() <= last.getTime()) {
    const days = Array.from({ length: DAYS_PER_WEEK }, (_, i) => addDays(cursor, i));
    rows.push({ start: cursor, end: addDays(cursor, DAYS_PER_WEEK - 1), days });
    cursor = addDays(cursor, DAYS_PER_WEEK);
  }
  return rows;
}

/**
 * Cut one span into the week rows it touches (BR-3).
 *
 * Returns nothing for a span entirely outside the window — the caller filters
 * server-side too, but a client that draws an item at column -4 draws it in the
 * wrong week, silently.
 */
export function segmentsFor<T extends CalendarItem>(
  item: T,
  span: Span,
  weeks: WeekRow[],
): (Omit<Segment<T>, "lane"> & { weekIndex: number })[] {
  const out: (Omit<Segment<T>, "lane"> & { weekIndex: number })[] = [];
  for (const [weekIndex, row] of weeks.entries()) {
    // Overlap of [span.start, span.end] with [row.start, row.end], inclusive.
    const from = span.start > row.start ? span.start : row.start;
    const to = span.end < row.end ? span.end : row.end;
    if (from.getTime() > to.getTime()) continue;

    const startCol = weekdayIndex(from);
    const endCol = weekdayIndex(to);
    out.push({
      item,
      weekIndex,
      startCol,
      endCol,
      length: endCol - startCol + 1,
      continuesBefore: span.start.getTime() < row.start.getTime(),
      continuesAfter: span.end.getTime() > row.end.getTime(),
    });
  }
  return out;
}

/**
 * Assign each segment a vertical lane so none overlaps another (BR-4).
 *
 * Order is longest-first, then earliest-start, then by id. Longest-first
 * matters: pack short bars first and a five-day bar arriving later finds every
 * lane blocked somewhere along its length and gets pushed to the bottom, under
 * items it visually contains. Sorting by id last makes the result **stable** —
 * the same input always produces the same grid, so an unrelated re-render does
 * not reshuffle the rows under someone's cursor.
 *
 * Segments that would land beyond `maxLanes` are not placed; they are counted
 * per-day as overflow instead (BR-5).
 */
export function packLanes<T extends CalendarItem>(
  segments: Omit<Segment<T>, "lane">[],
  maxLanes: number = MAX_LANES_PER_DAY,
): { placed: Segment<T>[]; overflow: number[] } {
  const ordered = [...segments].sort(
    (a, b) =>
      b.length - a.length ||
      a.startCol - b.startCol ||
      (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0),
  );

  // lanes[lane][col] — is that cell already taken?
  const lanes: boolean[][] = [];
  const placed: Segment<T>[] = [];
  const overflow = new Array<number>(DAYS_PER_WEEK).fill(0);

  for (const seg of ordered) {
    let lane = -1;
    for (let l = 0; l < maxLanes; l++) {
      const row = (lanes[l] ??= new Array<boolean>(DAYS_PER_WEEK).fill(false));
      let free = true;
      for (let c = seg.startCol; c <= seg.endCol; c++) {
        if (row[c]) {
          free = false;
          break;
        }
      }
      if (free) {
        lane = l;
        break;
      }
    }

    if (lane === -1) {
      // No room. Counted on every day it would have covered, so each cell's
      // "+N more" is true for that cell rather than for the week.
      for (let c = seg.startCol; c <= seg.endCol; c++) overflow[c]! += 1;
      continue;
    }

    const row = lanes[lane]!;
    for (let c = seg.startCol; c <= seg.endCol; c++) row[c] = true;
    placed.push({ ...seg, lane });
  }

  return { placed, overflow };
}

/**
 * The whole grid: items in, positioned week rows out.
 *
 * Items with no due date are skipped, not guessed at (BR-1) — the caller shows
 * them in the unscheduled panel.
 */
export function buildCalendar<T extends CalendarItem>(
  items: T[],
  from: Date,
  to: Date,
  maxLanes: number = MAX_LANES_PER_DAY,
): CalendarWeek<T>[] {
  const weeks = buildWeeks(from, to);
  const perWeek = weeks.map<Omit<Segment<T>, "lane">[]>(() => []);

  for (const item of items) {
    const span = spanOf(item);
    if (!span) continue;
    // `segmentsFor` reports which row each segment belongs to. Re-deriving it
    // from the segment's own `startCol` looks equivalent and is not: an issue
    // running Monday to Monday produces two segments both starting at column 0,
    // and a lookup by column puts them both in the first week.
    for (const seg of segmentsFor(item, span, weeks)) perWeek[seg.weekIndex]!.push(seg);
  }

  return weeks.map((row, i) => {
    const { placed, overflow } = packLanes(perWeek[i]!, maxLanes);
    return { row, segments: placed, overflow };
  });
}

/** Every day in the window, as `YYYY-MM-DD` — handy for cell keys. */
export function dayKeys(from: Date, to: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i <= daysBetween(from, to); i++) out.push(toDayString(addDays(from, i)));
  return out;
}
