import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  firstOccurrence,
  instantOf,
  isKnownTimeZone,
  nextOccurrence,
  wallClockIn,
  type RecurrenceRule,
} from "./schedule";

// The recurrence engine (ADR-0051 §1-§4). Every question a person will ask —
// why did I get three standups, why did nothing fire in February, why is my
// 9am task arriving at 8am since the clocks changed — is answerable here rather
// than by waiting a week to see.

const utc = (iso: string) => new Date(iso);

const rule = (over: Partial<RecurrenceRule> = {}): RecurrenceRule => ({
  frequency: "WEEKLY",
  interval: 1,
  startsOn: utc("2026-03-02T00:00:00Z"), // a Monday
  weekdays: [1],
  timeOfDay: 540, // 09:00
  timeZone: "UTC",
  ...over,
});

/** The wall clock a firing reads as, which is the only thing a person sees. */
const localOf = (instant: Date, zone: string) => {
  const w = wallClockIn(instant, zone);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${w.year}-${p(w.month)}-${p(w.day)} ${p(w.hour)}:${p(w.minute)}`;
};

describe("weekly", () => {
  it("fires on the next selected weekday at the chosen time", () => {
    const next = nextOccurrence(rule(), utc("2026-03-02T10:00:00Z"))!;
    expect(localOf(next, "UTC")).toBe("2026-03-09 09:00");
  });

  it("is strictly after, so advancing a schedule cannot return the firing that just happened", () => {
    // The loop this prevents has a database write in it.
    const fired = utc("2026-03-09T09:00:00Z");
    const next = nextOccurrence(rule(), fired)!;
    expect(next.getTime()).toBeGreaterThan(fired.getTime());
    expect(localOf(next, "UTC")).toBe("2026-03-16 09:00");
  });

  it("handles several days a week, in date order not selection order", () => {
    const r = rule({ weekdays: [5, 1, 3] }); // Fri, Mon, Wed
    let at = utc("2026-03-01T00:00:00Z");
    const days: string[] = [];
    for (let i = 0; i < 4; i++) {
      at = nextOccurrence(r, at)!;
      days.push(localOf(at, "UTC"));
    }
    expect(days).toEqual([
      "2026-03-02 09:00",
      "2026-03-04 09:00",
      "2026-03-06 09:00",
      "2026-03-09 09:00",
    ]);
  });

  it("'every other Tuesday' stays in phase with the Tuesday that was picked", () => {
    // Counted from the anchor day, so the phase is the user's choice rather
    // than an accident of which week the calendar thinks it is.
    const r = rule({
      interval: 2,
      startsOn: utc("2026-03-03T00:00:00Z"), // Tuesday
      weekdays: [2],
    });
    let at = utc("2026-03-01T00:00:00Z");
    const days: string[] = [];
    for (let i = 0; i < 3; i++) {
      at = nextOccurrence(r, at)!;
      days.push(localOf(at, "UTC").slice(0, 10));
    }
    expect(days).toEqual(["2026-03-03", "2026-03-17", "2026-03-31"]);
  });

  it("with no weekday ticked, uses the day it started on rather than never firing", () => {
    const r = rule({ weekdays: [], startsOn: utc("2026-03-05T00:00:00Z") }); // Thursday
    expect(localOf(nextOccurrence(r, utc("2026-03-01T00:00:00Z"))!, "UTC")).toBe(
      "2026-03-05 09:00",
    );
  });
});

describe("daily", () => {
  it("fires the next day once today's time has passed", () => {
    const r = rule({ frequency: "DAILY", startsOn: utc("2026-03-02T00:00:00Z") });
    expect(localOf(nextOccurrence(r, utc("2026-03-04T09:00:00Z"))!, "UTC")).toBe(
      "2026-03-05 09:00",
    );
  });

  it("still fires later today when the time has not passed yet", () => {
    const r = rule({ frequency: "DAILY", startsOn: utc("2026-03-02T00:00:00Z") });
    expect(localOf(nextOccurrence(r, utc("2026-03-04T08:59:00Z"))!, "UTC")).toBe(
      "2026-03-04 09:00",
    );
  });

  it("skipWeekends jumps Saturday and Sunday", () => {
    const r = rule({
      frequency: "DAILY",
      skipWeekends: true,
      startsOn: utc("2026-03-02T00:00:00Z"),
    });
    // Friday the 6th → Monday the 9th.
    expect(localOf(nextOccurrence(r, utc("2026-03-06T09:00:00Z"))!, "UTC")).toBe(
      "2026-03-09 09:00",
    );
  });

  it("every 3 days counts from the start, not from the last firing", () => {
    const r = rule({ frequency: "DAILY", interval: 3, startsOn: utc("2026-03-02T00:00:00Z") });
    let at = utc("2026-03-01T00:00:00Z");
    const days: string[] = [];
    for (let i = 0; i < 3; i++) {
      at = nextOccurrence(r, at)!;
      days.push(localOf(at, "UTC").slice(0, 10));
    }
    expect(days).toEqual(["2026-03-02", "2026-03-05", "2026-03-08"]);
  });
});

describe("monthly", () => {
  it("fires on the chosen day each month", () => {
    const r = rule({ frequency: "MONTHLY", dayOfMonth: 15, startsOn: utc("2026-01-01T00:00:00Z") });
    expect(localOf(nextOccurrence(r, utc("2026-03-20T00:00:00Z"))!, "UTC")).toBe(
      "2026-04-15 09:00",
    );
  });

  it("CLAMPS the 31st to the end of a short month rather than skipping it", () => {
    // The bug this pins: a "last day of the month" review that silently never
    // happens in February, April, June, September or November.
    const r = rule({ frequency: "MONTHLY", dayOfMonth: 31, startsOn: utc("2026-01-31T00:00:00Z") });
    expect(localOf(nextOccurrence(r, utc("2026-01-31T10:00:00Z"))!, "UTC")).toBe(
      "2026-02-28 09:00",
    );
  });

  it("clamps to 29 in a leap February", () => {
    const r = rule({ frequency: "MONTHLY", dayOfMonth: 31, startsOn: utc("2028-01-31T00:00:00Z") });
    expect(localOf(nextOccurrence(r, utc("2028-01-31T10:00:00Z"))!, "UTC")).toBe(
      "2028-02-29 09:00",
    );
  });

  it("interval 3 is a quarter and interval 12 is a year", () => {
    // Why there is no YEARLY frequency: these already are one.
    const quarterly = rule({
      frequency: "MONTHLY",
      interval: 3,
      dayOfMonth: 1,
      startsOn: utc("2026-01-01T00:00:00Z"),
    });
    expect(localOf(nextOccurrence(quarterly, utc("2026-01-02T00:00:00Z"))!, "UTC")).toBe(
      "2026-04-01 09:00",
    );

    const yearly = rule({
      frequency: "MONTHLY",
      interval: 12,
      dayOfMonth: 1,
      startsOn: utc("2026-01-01T00:00:00Z"),
    });
    expect(localOf(nextOccurrence(yearly, utc("2026-01-02T00:00:00Z"))!, "UTC")).toBe(
      "2027-01-01 09:00",
    );
  });
});

// The part with no second-best answer: get it wrong and half an org's standups
// land an hour early for six months of the year.
describe("time zones", () => {
  it("09:00 means 09:00 where the team is, not 09:00 UTC", () => {
    const r = rule({ timeZone: "Asia/Kolkata" }); // UTC+5:30, no DST
    const next = nextOccurrence(r, utc("2026-03-02T10:00:00Z"))!;
    expect(localOf(next, "Asia/Kolkata")).toBe("2026-03-09 09:00");
    // …which is 03:30 UTC.
    expect(next.toISOString()).toBe("2026-03-09T03:30:00.000Z");
  });

  it("holds the LOCAL time across a spring-forward, moving the UTC instant", () => {
    // London goes to BST on 29 March 2026. A 09:00 standup stays at 09:00 for
    // the people attending it; the UTC instant is what moves.
    const r = rule({ timeZone: "Europe/London" });
    const before = nextOccurrence(r, utc("2026-03-22T10:00:00Z"))!; // Mon 23 Mar, GMT
    const after = nextOccurrence(r, utc("2026-03-29T10:00:00Z"))!; // Mon 30 Mar, BST
    expect(localOf(before, "Europe/London")).toBe("2026-03-23 09:00");
    expect(localOf(after, "Europe/London")).toBe("2026-03-30 09:00");
    expect(before.toISOString()).toBe("2026-03-23T09:00:00.000Z");
    expect(after.toISOString()).toBe("2026-03-30T08:00:00.000Z");
  });

  it("holds the local time across an autumn fall-back too", () => {
    const r = rule({ timeZone: "America/New_York" });
    // US clocks go back on 1 November 2026.
    const before = nextOccurrence(r, utc("2026-10-25T23:00:00Z"))!; // Mon 26 Oct, EDT
    const after = nextOccurrence(r, utc("2026-11-01T23:00:00Z"))!; // Mon 2 Nov, EST
    expect(localOf(before, "America/New_York")).toBe("2026-10-26 09:00");
    expect(localOf(after, "America/New_York")).toBe("2026-11-02 09:00");
    expect(before.toISOString()).toBe("2026-10-26T13:00:00.000Z");
    expect(after.toISOString()).toBe("2026-11-02T14:00:00.000Z");
  });

  it("a wall time inside the spring-forward gap resolves forward, not to never", () => {
    // London's clocks go 01:00 → 02:00 on 29 March 2026, so 01:30 local does
    // not exist that day. An alarm set for it should still ring, and every
    // calendar app rings it after the jump.
    const resolved = instantOf(
      { year: 2026, month: 3, day: 29, hour: 1, minute: 30 },
      "Europe/London",
    );
    expect(localOf(resolved, "Europe/London")).toBe("2026-03-29 02:30");
  });

  it("a day boundary is the LOCAL day, not the UTC one", () => {
    // Sydney is UTC+11 in March, so Monday 09:00 there is Sunday 22:00 UTC.
    // A firing whose UTC date reads Sunday the 8th is the Monday occurrence —
    // reasoning in UTC days would push it a week late.
    const r = rule({ timeZone: "Australia/Sydney", weekdays: [1] });
    const next = nextOccurrence(r, utc("2026-03-08T12:00:00Z"))!;
    expect(localOf(next, "Australia/Sydney")).toBe("2026-03-09 09:00");
    expect(next.toISOString()).toBe("2026-03-08T22:00:00.000Z");
  });

  it("knows a real zone from a typo", () => {
    expect(isKnownTimeZone("Europe/London")).toBe(true);
    expect(isKnownTimeZone("Middle/Earth")).toBe(false);
  });
});

// BR-4 — the difference between a restored service and an inbox full of spam.
describe("never backfilling", () => {
  it("a scheduler down for three weeks produces ONE next date, not three", () => {
    const r = rule();
    // Last fired 2 March; it is now the 23rd.
    const next = nextOccurrence(r, utc("2026-03-02T09:00:00Z"));
    // The engine's job is only ever to name the NEXT one; the service fires at
    // most one issue per tick. Asserting the shape of the contract here.
    expect(localOf(next!, "UTC")).toBe("2026-03-09 09:00");

    // And advancing past "now" jumps the gap in a single step rather than
    // walking every missed Monday.
    const caughtUp = nextOccurrence(r, utc("2026-03-23T12:00:00Z"))!;
    expect(localOf(caughtUp, "UTC")).toBe("2026-03-30 09:00");
  });

  it("never fires before the schedule starts", () => {
    const r = rule({ startsOn: utc("2026-06-01T00:00:00Z") });
    const next = nextOccurrence(r, utc("2026-03-02T00:00:00Z"))!;
    expect(next.getTime()).toBeGreaterThanOrEqual(utc("2026-06-01T00:00:00Z").getTime());
    expect(localOf(next, "UTC")).toBe("2026-06-01 09:00"); // a Monday
  });
});

describe("ending", () => {
  it("returns null once past endsOn", () => {
    const r = rule({ endsOn: utc("2026-03-15T00:00:00Z") });
    expect(nextOccurrence(r, utc("2026-03-02T10:00:00Z"))).not.toBeNull(); // the 9th
    expect(nextOccurrence(r, utc("2026-03-09T10:00:00Z"))).toBeNull(); // the 16th is too late
  });
});

describe("the first firing of a new recurrence", () => {
  it("fires today when today is a match and the time has not passed", () => {
    // Created at 08:00 on the start day; must not wait a whole week.
    const r = rule({ startsOn: utc("2026-03-02T00:00:00Z") });
    expect(localOf(firstOccurrence(r, utc("2026-03-02T08:00:00Z"))!, "UTC")).toBe(
      "2026-03-02 09:00",
    );
  });

  it("waits for the next match when today's time has already gone", () => {
    const r = rule({ startsOn: utc("2026-03-02T00:00:00Z") });
    expect(localOf(firstOccurrence(r, utc("2026-03-02T10:00:00Z"))!, "UTC")).toBe(
      "2026-03-09 09:00",
    );
  });

  it("respects a start date in the future", () => {
    const r = rule({ startsOn: utc("2026-04-06T00:00:00Z") }); // a Monday
    expect(localOf(firstOccurrence(r, utc("2026-03-02T08:00:00Z"))!, "UTC")).toBe(
      "2026-04-06 09:00",
    );
  });
});

describe("the schedule as a sentence", () => {
  const say = (over: Partial<RecurrenceRule>) => describeSchedule(rule(over));

  it("reads the way people say it", () => {
    expect(say({ frequency: "DAILY", interval: 1 })).toBe("Every day at 09:00");
    expect(say({ frequency: "DAILY", interval: 1, skipWeekends: true })).toBe(
      "Every weekday at 09:00",
    );
    expect(say({ weekdays: [1] })).toBe("Every Monday at 09:00");
    expect(say({ weekdays: [1, 3, 5] })).toBe("Every Monday, Wednesday and Friday at 09:00");
    expect(say({ interval: 2, weekdays: [2] })).toBe("Every other Tuesday at 09:00");
  });

  it("names quarterly and yearly rather than making people count months", () => {
    expect(say({ frequency: "MONTHLY", interval: 3, dayOfMonth: 1 })).toBe(
      "Every quarter on the 1st at 09:00",
    );
    expect(say({ frequency: "MONTHLY", interval: 12, dayOfMonth: 15 })).toBe(
      "Every year on the 15th at 09:00",
    );
    expect(say({ frequency: "MONTHLY", interval: 1, dayOfMonth: 22 })).toBe(
      "Every month on the 22nd at 09:00",
    );
    expect(say({ frequency: "MONTHLY", interval: 1, dayOfMonth: 3 })).toBe(
      "Every month on the 3rd at 09:00",
    );
    expect(say({ frequency: "MONTHLY", interval: 1, dayOfMonth: 11 })).toBe(
      "Every month on the 11th at 09:00",
    );
  });

  it("formats an odd time of day without losing the leading zero", () => {
    expect(say({ weekdays: [1], timeOfDay: 5 })).toBe("Every Monday at 00:05");
    expect(say({ weekdays: [1], timeOfDay: 23 * 60 + 45 })).toBe("Every Monday at 23:45");
  });
});
