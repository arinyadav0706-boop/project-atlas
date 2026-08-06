// Pure workload arithmetic (ADR-0034). No I/O, no Prisma — unit-tested in
// isolation because these few lines are the whole model.
import type { WorkloadStatus } from "@/features/workload/types/workload.types";

// A company's working week. Stored per organization (ADR-0034 amendment): a
// 6-day/8-hour company and a 5-day/9-hour company must not share a hardcoded
// week. Bands below stay relative to whatever this is, so "2 weeks queued"
// means two of THAT company's weeks.
export interface WorkingWeek {
  minutesPerDay: number;
  daysPerWeek: number;
}

// Used only when an organization row is somehow unreadable; the real value
// comes from Organization.workingMinutesPerDay/workingDaysPerWeek.
export const DEFAULT_WORKING_WEEK: WorkingWeek = { minutesPerDay: 480, daysPerWeek: 5 };

export function weeklyCapacityMinutes(week: WorkingWeek): number {
  const minutes = week.minutesPerDay * week.daysPerWeek;
  // Never divide by zero downstream; a misconfigured org falls back rather
  // than rendering Infinity weeks of work.
  return minutes > 0
    ? minutes
    : DEFAULT_WORKING_WEEK.minutesPerDay * DEFAULT_WORKING_WEEK.daysPerWeek;
}

// The line at which a person is "overloaded": more than two weeks queued.
export const OVERLOADED_WEEKS = 2;
// Below this, they have room for more.
export const LIGHT_WEEKS = 0.5;

// Work still ahead of you on one issue (BR-1). Logged time already spent is
// subtracted; overrunning an estimate contributes 0, never a negative that
// would mask a colleague's real load.
export function remainingMinutes(
  estimateMinutes: number | null,
  loggedMinutes: number,
): number {
  if (estimateMinutes === null) return 0; // unestimated: counted separately (BR-4)
  return Math.max(estimateMinutes - loggedMinutes, 0);
}

// Weeks of queued work, rounded to one decimal for display stability. The
// status band is computed from this same rounded value, so the label always
// agrees with the number on screen.
export function weeksOfWork(remaining: number, weeklyCapacity: number): number {
  return Math.round((remaining / weeklyCapacity) * 10) / 10;
}

// Status band (BR-6). `openIssues` distinguishes "nothing assigned" from
// "assigned but nothing estimated" — both have zero remaining effort, and a
// manager needs to tell them apart.
export function workloadStatus(weeks: number, openIssues: number): WorkloadStatus {
  if (openIssues === 0) return "IDLE";
  if (weeks > OVERLOADED_WEEKS) return "OVERLOADED";
  if (weeks < LIGHT_WEEKS) return "LIGHT";
  return "BALANCED";
}

// Bar fill 0..1, where a full bar is the overloaded line (2 weeks).
export function loadFraction(weeks: number): number {
  return Math.max(0, Math.min(weeks / OVERLOADED_WEEKS, 1));
}

// A grid cell holding real minutes must never print "0%". Nine minutes of a
// 45-hour week rounds to zero, and a cell reading "9m / 0%" tells a manager
// there is nothing there when there is something — the empty/zero/unknown
// distinction the visualisation rules insist on
// (docs/05_UI/03_Data_Visualisation.md §4 rule 6).
export function formatCapacityPercent(minutes: number, percent: number): string {
  return minutes > 0 && percent === 0 ? "<1%" : `${percent}%`;
}

// "8h × 5 days = 40h week" — shown wherever a capacity number appears, so the
// basis is never a mystery.
export function describeWorkingWeek(week: WorkingWeek): string {
  const perDay = week.minutesPerDay / 60;
  const dayLabel = Number.isInteger(perDay) ? `${perDay}h` : `${perDay.toFixed(1)}h`;
  const weekly = weeklyCapacityMinutes(week) / 60;
  const weekLabel = Number.isInteger(weekly) ? `${weekly}h` : `${weekly.toFixed(1)}h`;
  return `${dayLabel} × ${week.daysPerWeek} days = ${weekLabel} week`;
}
