// UTC, Monday-start week arithmetic (ADR-0035 §2).
//
// UTC throughout: a grid that shifts its column boundaries with the reader's
// timezone would give two managers different numbers for the same team.

export const MS_PER_DAY = 86_400_000;

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// Monday = 0 … Sunday = 6. JS gives Sunday = 0, which would put Sunday at the
// start of the week and split every working week across two columns.
export function utcWeekdayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

export function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  return new Date(day.getTime() - utcWeekdayIndex(day) * MS_PER_DAY);
}

export function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

// Whole days from `from` to `to` inclusive; 0 when the range is inverted.
export function inclusiveDayCount(from: Date, to: Date): number {
  const days = Math.floor((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / MS_PER_DAY);
  return days < 0 ? 0 : days + 1;
}

// A `daysPerWeek`-day company works the first N days from Monday. Clamped so a
// misconfigured organization can't mark zero days workable and strand every
// issue (capacity.ts makes the same defensive choice).
export function isWorkingDay(date: Date, daysPerWeek: number): boolean {
  const span = Math.min(Math.max(daysPerWeek, 1), 7);
  return utcWeekdayIndex(date) < span;
}

// Working days in [from, to] inclusive, in constant time rather than by walking
// the range — a due date years out would otherwise cost thousands of iterations
// per issue, on every row of the grid.
export function countWorkingDays(from: Date, to: Date, daysPerWeek: number): number {
  const totalDays = inclusiveDayCount(from, to);
  if (totalDays === 0) return 0;

  const span = Math.min(Math.max(daysPerWeek, 1), 7);
  // Any 7 consecutive days contain each weekday exactly once, so whole weeks
  // contribute `span` working days regardless of where the range starts.
  const wholeWeeks = Math.floor(totalDays / 7);
  let count = wholeWeeks * span;

  const start = startOfUtcDay(from);
  for (let i = wholeWeeks * 7; i < totalDays; i += 1) {
    if (isWorkingDay(addUtcDays(start, i), span)) count += 1;
  }
  return count;
}

// `count` consecutive week starts, beginning with the week containing `from`.
export function buildHorizon(from: Date, count: number): Date[] {
  const first = startOfUtcWeek(from);
  return Array.from({ length: Math.max(count, 0) }, (_, i) => addUtcDays(first, i * 7));
}

// "Aug 3–7", or "Aug 31–Sep 4" across a month boundary. The working span only:
// a 5-day company's week column is labelled Monday to Friday, because Saturday
// carries none of its effort.
export function formatWeekLabel(weekStart: Date, daysPerWeek: number): string {
  const span = Math.min(Math.max(daysPerWeek, 1), 7);
  const end = addUtcDays(weekStart, span - 1);
  const startMonth = SHORT_MONTHS[weekStart.getUTCMonth()]!;
  const endMonth = SHORT_MONTHS[end.getUTCMonth()]!;
  return startMonth === endMonth
    ? `${startMonth} ${weekStart.getUTCDate()}–${end.getUTCDate()}`
    : `${startMonth} ${weekStart.getUTCDate()}–${endMonth} ${end.getUTCDate()}`;
}
