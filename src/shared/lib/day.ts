// What a DAY means, for every view that draws one (ADR-0048 §1).
//
// This lived in `features/timeline/lib/scale.ts` while the Timeline was the
// only consumer. The Calendar is the second, and it must agree with the
// Timeline exactly: a second copy of "which day is this issue on" would let the
// same issue sit on the 14th in one view and the 15th in the other, which
// nobody reports as a bug — they just quietly stop trusting both.
//
// Pure, no React, no Prisma, no DOM. The pixel-shaped half of the old module
// (axis, zoom, bar boxes, drag resolution) stayed behind in `scale.ts`.

export const MS_PER_DAY = 86_400_000;

/**
 * Midnight UTC of the day an instant falls on.
 *
 * UTC, deliberately, everywhere in this module. A due date is a *day*, not an
 * instant — "the 14th" means the same thing in Mumbai and Lisbon — and the
 * moment local time enters the arithmetic, an issue due the 14th renders in the
 * 13th's cell for everyone west of UTC. The one place local time is allowed is
 * a label a human reads.
 */
export function startOfDay(date: Date | string): Date {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(startOfDay(date).getTime() + days * MS_PER_DAY);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: Date | string, to: Date | string): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

/** ISO `YYYY-MM-DD` — the wire format for a day, with no time to misread. */
export function toDayString(date: Date): string {
  return startOfDay(date).toISOString().slice(0, 10);
}

/** Day of week with **Monday as 0** (BR-10 of 29_calendar). */
export function weekdayIndex(date: Date): number {
  return (startOfDay(date).getUTCDay() + 6) % 7;
}

/** The Monday on or before `date`. */
export function startOfWeek(date: Date): Date {
  return addDays(date, -weekdayIndex(date));
}

/** Midnight UTC on the 1st of the month `date` falls in. */
export function startOfMonth(date: Date): Date {
  const d = startOfDay(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** `months` later (or earlier), clamped to the last valid day of that month. */
export function addMonths(date: Date, months: number): Date {
  const d = startOfDay(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  // 31 January + 1 month is 28 February, not 3 March. Rolling over is how a
  // "next month" button skips a month every spring.
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), lastDay)),
  );
}

/**
 * A scheduled span.
 *
 * `end` is INCLUSIVE — an issue due the 14th occupies the 14th. So a one-day
 * span has start === end and a width of one day, not zero. Getting this wrong
 * is the classic Gantt/calendar bug: everything renders one day short and
 * nobody can say why the last day is missing.
 */
export interface Span {
  start: Date;
  end: Date;
}

/**
 * What a row's dates mean (28_timeline BR-2/BR-3, 29_calendar BR-1/BR-2).
 *
 * Returns null for genuinely unscheduled work — never an invented position. An
 * issue with a due date and no start is one day long ON the due date, because
 * the deadline is the only thing anybody actually knows.
 */
export function spanOf(input: {
  startDate?: string | Date | null;
  dueDate?: string | Date | null;
}): Span | null {
  const due = input.dueDate ? startOfDay(input.dueDate) : null;
  const start = input.startDate ? startOfDay(input.startDate) : null;
  if (!due) return null;
  if (!start || start.getTime() > due.getTime()) {
    // A start after its due date is corrupt rather than expressive; the API
    // refuses it, and if one is already stored every view shows the one fact it
    // can defend instead of drawing a negative-width bar.
    return { start: due, end: due };
  }
  return { start, end: due };
}

/** The union of several spans — an Epic's roll-up (28_timeline BR-6). */
export function unionSpan(spans: Span[]): Span | null {
  if (spans.length === 0) return null;
  let start = spans[0]!.start;
  let end = spans[0]!.end;
  for (const s of spans.slice(1)) {
    if (s.start < start) start = s.start;
    if (s.end > end) end = s.end;
  }
  return { start, end };
}
