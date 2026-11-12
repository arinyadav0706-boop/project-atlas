// Calendar arithmetic for timesheet periods (37_timesheets BR-1, BR-3).
//
// Dates are ISO "YYYY-MM-DD" strings in the domain and midnight-UTC `Date`s at
// the DATE-column boundary — the same convention as work logs (module 19).
// Working in date strings rather than local `Date`s keeps every period
// calculation independent of the server's timezone; only "today" and the
// deadline instant depend on the policy's timezone, and both go through Intl.

export type IsoDate = string;

const DAY_MS = 86_400_000;

export function toIsoDate(d: Date): IsoDate {
  return d.toISOString().slice(0, 10);
}

export function fromIsoDate(s: IsoDate): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = fromIsoDate(s);
  return !Number.isNaN(d.getTime()) && toIsoDate(d) === s;
}

export function addDays(s: IsoDate, n: number): IsoDate {
  return toIsoDate(new Date(fromIsoDate(s).getTime() + n * DAY_MS));
}

// 0 = Sunday … 6 = Saturday, matching TimesheetPolicy.weekStartDay.
export function weekday(s: IsoDate): number {
  return fromIsoDate(s).getUTCDay();
}

export function periodStartFor(date: IsoDate, weekStartDay: number): IsoDate {
  const back = (weekday(date) - weekStartDay + 7) % 7;
  return addDays(date, -back);
}

export function isPeriodStart(date: IsoDate, weekStartDay: number): boolean {
  return weekday(date) === weekStartDay;
}

export function daysBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const out: IsoDate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// Today's calendar date in `timeZone`, so "no future days" (BR-6) follows the
// organization's clock, not the server's.
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function offsetMinutesAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant) / 60_000);
}

// The UTC instant of a wall-clock time in `timeZone`. Two passes, so a
// deadline that falls just after a DST change still lands on the right hour.
export function zonedTimeToUtc(date: IsoDate, hhmm: string, timeZone: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const wall = fromIsoDate(date).getTime() + ((h ?? 0) * 60 + (m ?? 0)) * 60_000;
  let guess = wall - offsetMinutesAt(wall, timeZone) * 60_000;
  guess = wall - offsetMinutesAt(guess, timeZone) * 60_000;
  return new Date(guess);
}

// BR-3: the first `dueWeekday` after the period ends, at `dueTime`, in the
// policy timezone. Default policy: Monday 11:00 for the week before.
export function deadlineFor(
  periodEnd: IsoDate,
  policy: { dueWeekday: number; dueTime: string; timezone: string },
): Date {
  const after = addDays(periodEnd, 1);
  const ahead = (policy.dueWeekday - weekday(after) + 7) % 7;
  return zonedTimeToUtc(addDays(after, ahead), policy.dueTime, policy.timezone);
}
