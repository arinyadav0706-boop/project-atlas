// Pure workload arithmetic (ADR-0034). No I/O, no Prisma — unit-tested in
// isolation because these few lines are the whole model.
import type { WorkloadStatus } from "@/features/workload/types/workload.types";

// The reference working week: 8 h × 5 d. Deliberately a constant, NOT a
// database field — per-person capacity (part-time, leave) is future scope and
// would replace this without touching the aggregation (ADR-0034, rule 2).
export const WEEKLY_CAPACITY_MINUTES = 8 * 60 * 5;

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

// Weeks of queued work, rounded to one decimal for display stability.
export function weeksOfWork(remaining: number): number {
  return Math.round((remaining / WEEKLY_CAPACITY_MINUTES) * 10) / 10;
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
