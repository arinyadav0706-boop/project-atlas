// When a recurrence fires next (ADR-0051). Pure: no Prisma, no clock of its
// own, no IO — every instant it reasons about is passed in.
//
// Pure for the same reason the Timeline's date maths and the Calendar's grid
// are: this is where "why did I get three standups on Tuesday" lives, and it
// must be answerable in a unit test rather than by waiting a week.
//
// No date library, by necessity — the project has none — so the time-zone
// arithmetic below is done with `Intl.DateTimeFormat`, which every runtime
// ships with the IANA database behind it.

export const RECURRENCE_MODES = ["FIXED_SCHEDULE", "AFTER_COMPLETION"] as const;
export type RecurrenceModeDto = (typeof RECURRENCE_MODES)[number];

export const RECURRENCE_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type RecurrenceFrequencyDto = (typeof RECURRENCE_FREQUENCIES)[number];

/** Minutes past local midnight; 540 = 09:00. */
export const DEFAULT_TIME_OF_DAY = 540;

/**
 * How far ahead the search will look before giving up.
 *
 * A guard against a rule that can never match — "monthly on the 31st" is fine
 * (it clamps), but a future edit could introduce one that isn't, and an
 * unbounded `while` inside a scheduler tick is how one bad row takes down
 * everybody's.
 */
const MAX_SEARCH_DAYS = 800;

export interface RecurrenceRule {
  frequency: RecurrenceFrequencyDto;
  /** Every N days/weeks/months. */
  interval: number;
  /** The day every interval is counted from (BR-15). */
  startsOn: Date;
  /** WEEKLY: 0=Sunday … 6=Saturday. Empty means "the weekday `startsOn` falls on". */
  weekdays: number[];
  /** MONTHLY: clamped to the month's length, so the 31st fires on 28 February. */
  dayOfMonth?: number | null;
  timeOfDay: number;
  timeZone: string;
  /** DAILY only. */
  skipWeekends?: boolean;
  /** Stop after this instant. */
  endsOn?: Date | null;
}

interface Wall {
  year: number;
  /** 1-12, as humans and `Intl` both count them. */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  // Constructing one of these is expensive enough to matter in a tick that
  // walks hundreds of candidate days.
  let cached = FORMATTER_CACHE.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    FORMATTER_CACHE.set(timeZone, cached);
  }
  return cached;
}

/** Whether a string is an IANA zone this runtime knows. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** The wall clock an instant reads as, in a zone. */
export function wallClockIn(instant: Date, timeZone: string): Wall & { second: number } {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    // `hour: "2-digit"` with hour12:false yields 24 for midnight in some
    // runtimes. Normalising here rather than at each call site.
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

/** A zone's offset from UTC, in ms, at a given instant. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const w = wallClockIn(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - instant.getTime();
}

/**
 * The instant at which a zone's wall clock reads `wall`.
 *
 * Two passes, deliberately. The offset is a function of the instant, and the
 * instant is what we are solving for, so the first guess uses the offset at the
 * wrong moment — which is only wrong across a DST boundary, and is then wrong
 * by exactly the shift. Re-reading the offset at the corrected instant fixes it.
 *
 * A wall time that does not exist — the hour skipped at spring forward, 01:00
 * to 01:59 in London — resolves to the instant just after the jump, shifted by
 * exactly the offset change. That is the standard behaviour and the one a
 * person expects: the alarm rings late, not never.
 */
export function instantOf(wall: Wall, timeZone: string): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  const firstPass = new Date(naive - offsetMsAt(new Date(naive), timeZone));
  return new Date(naive - offsetMsAt(firstPass, timeZone));
}

const MS_PER_DAY = 86_400_000;

/** The civil day `instant` falls on in `timeZone`, as a UTC-midnight marker. */
function civilDay(instant: Date, timeZone: string): Date {
  const w = wallClockIn(instant, timeZone);
  return new Date(Date.UTC(w.year, w.month - 1, w.day));
}

const addCivilDays = (day: Date, n: number) => new Date(day.getTime() + n * MS_PER_DAY);

/** Whole civil days between two UTC-midnight markers. */
const civilDaysBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

const isWeekend = (day: Date) => day.getUTCDay() === 0 || day.getUTCDay() === 6;

/**
 * Whole months between two civil days, ignoring the day of the month — the
 * unit a monthly interval is actually counted in.
 */
const monthsBetween = (from: Date, to: Date) =>
  (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
  (to.getUTCMonth() - from.getUTCMonth());

/**
 * The first firing strictly after `after`.
 *
 * `null` when the rule has run out — past `endsOn`, or no match inside the
 * search horizon.
 *
 * Strictly after, never equal: this is called to advance a schedule that has
 * just fired, and "the next one" returning the one that just happened is an
 * infinite loop with a database write in it.
 */
export function nextOccurrence(rule: RecurrenceRule, after: Date): Date | null {
  const zone = rule.timeZone;
  const interval = Math.max(1, Math.trunc(rule.interval));
  const anchorDay = civilDay(rule.startsOn, zone);

  // Start looking from whichever is later: the schedule's own start, or the
  // moment we are advancing past. A recurrence created today to begin next
  // month must not fire eleven times catching up (BR-4, BR-15).
  const floor = after.getTime() > rule.startsOn.getTime() ? after : rule.startsOn;
  const firstCandidateDay = civilDay(floor, zone);

  const matches = (day: Date): boolean => {
    if (day.getTime() < anchorDay.getTime()) return false;
    switch (rule.frequency) {
      case "DAILY": {
        if (rule.skipWeekends && isWeekend(day)) return false;
        return civilDaysBetween(anchorDay, day) % interval === 0;
      }
      case "WEEKLY": {
        // Empty selection means "the day the schedule started on" — a weekly
        // recurrence with no day ticked is not a recurrence that never fires.
        const days = rule.weekdays.length > 0 ? rule.weekdays : [anchorDay.getUTCDay()];
        if (!days.includes(day.getUTCDay())) return false;
        // Weeks counted from the anchor DAY, not from a calendar week
        // boundary, so "every other Tuesday" stays in phase with the Tuesday
        // the person picked and needs no opinion about which day starts a week.
        const weeks = Math.floor(civilDaysBetween(anchorDay, day) / 7);
        return weeks % interval === 0;
      }
      case "MONTHLY": {
        const target = rule.dayOfMonth ?? anchorDay.getUTCDate();
        const clamped = Math.min(
          target,
          daysInMonth(day.getUTCFullYear(), day.getUTCMonth() + 1),
        );
        if (day.getUTCDate() !== clamped) return false;
        return monthsBetween(anchorDay, day) % interval === 0;
      }
    }
  };

  // 800 days covers the widest schedule validation permits (monthly, interval
  // 24). Anything that finds no match inside it cannot match at all.
  for (let step = 0; step <= MAX_SEARCH_DAYS; step++) {
    const day = addCivilDays(firstCandidateDay, step);
    if (!matches(day)) continue;
    const fireAt = instantOf(
      {
        year: day.getUTCFullYear(),
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
        hour: Math.floor(rule.timeOfDay / 60),
        minute: rule.timeOfDay % 60,
      },
      zone,
    );
    // The first matching DAY may still be earlier in the day than `after` —
    // "every day at 09:00", advanced past 09:00 today, must land tomorrow.
    if (fireAt.getTime() <= after.getTime()) continue;
    if (rule.endsOn && fireAt.getTime() > rule.endsOn.getTime()) return null;
    return fireAt;
  }
  return null;
}

/**
 * The first firing of a brand-new recurrence.
 *
 * Distinct from `nextOccurrence` in one way that matters: a schedule starting
 * today at 09:00, created at 08:00, should fire at 09:00 today rather than
 * waiting a full period. So the search floor is the start of the start day, not
 * the moment of creation.
 */
export function firstOccurrence(rule: RecurrenceRule, now: Date): Date | null {
  const from = rule.startsOn.getTime() > now.getTime() ? rule.startsOn : now;
  // One millisecond before the candidate floor, because `nextOccurrence` is
  // strictly-after and a start time exactly on the boundary should count.
  return nextOccurrence(rule, new Date(from.getTime() - 1));
}

/**
 * `days` civil days after `from`, at the recurrence's own local time.
 *
 * What an AFTER_COMPLETION recurrence schedules on completion. Adding 90×24h to
 * the instant somebody happened to click Done would land at 14:37 on a
 * Thursday; a schedule should keep the time of day it was configured with, and
 * survive a DST change in between.
 */
export function atLocalTimeDaysAhead(
  from: Date,
  days: number,
  timeOfDay: number,
  timeZone: string,
): Date {
  const day = addCivilDays(civilDay(from, timeZone), days);
  return instantOf(
    {
      year: day.getUTCFullYear(),
      month: day.getUTCMonth() + 1,
      day: day.getUTCDate(),
      hour: Math.floor(timeOfDay / 60),
      minute: timeOfDay % 60,
    },
    timeZone,
  );
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const ORDINAL = (n: number): string => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
};

const clock = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

const joinWords = (words: string[]): string =>
  words.length <= 1
    ? (words[0] ?? "")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;

/**
 * The schedule as a sentence.
 *
 * The list is where somebody scanning ten recurrences works out which one is
 * producing the ticket they did not expect, and "WEEKLY / 2 / [2,4]" is not
 * something anybody should have to decode.
 */
export function describeSchedule(
  rule: Pick<
    RecurrenceRule,
    "frequency" | "interval" | "weekdays" | "dayOfMonth" | "timeOfDay" | "timeZone" | "skipWeekends" | "startsOn"
  >,
): string {
  const n = Math.max(1, Math.trunc(rule.interval));
  const at = ` at ${clock(rule.timeOfDay)}`;

  switch (rule.frequency) {
    case "DAILY": {
      const every =
        n === 1 ? (rule.skipWeekends ? "Every weekday" : "Every day") : `Every ${n} days`;
      const weekdayNote = n > 1 && rule.skipWeekends ? ", weekdays only" : "";
      return `${every}${at}${weekdayNote}`;
    }
    case "WEEKLY": {
      const days =
        rule.weekdays.length > 0
          ? [...rule.weekdays].sort((a, b) => a - b)
          : [civilDay(rule.startsOn, rule.timeZone).getUTCDay()];
      const names = joinWords(days.map((d) => WEEKDAY_NAMES[d] ?? "?"));
      // "Every other" reads better than "every 2 weeks" and is what every
      // calendar app says.
      const every = n === 1 ? "Every" : n === 2 ? "Every other" : `Every ${n} weeks on`;
      return `${every} ${names}${at}`;
    }
    case "MONTHLY": {
      const day = rule.dayOfMonth ?? civilDay(rule.startsOn, rule.timeZone).getUTCDate();
      // The cadences people actually mean, named the way they say them.
      const every =
        n === 1 ? "Every month" : n === 3 ? "Every quarter" : n === 12 ? "Every year" : `Every ${n} months`;
      return `${every} on the ${ORDINAL(day)}${at}`;
    }
  }
}
