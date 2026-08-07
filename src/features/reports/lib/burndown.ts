// Sprint burndown arithmetic (ADR-0037). Pure — no I/O, no Prisma, no React —
// because this is the only report that reads *history*, and history is the
// easiest thing in a product to be quietly wrong about.
//
// The one approximation is the cohort: sprint membership is not audited, so we
// burn down the issues in the sprint *now*. Status, by contrast, is replayed
// exactly — see `statusAt`.

export type BurndownUnit = "points" | "issues" | "hours";

export interface BurndownIssue {
  id: string;
  status: string;
  storyPoints: number | null;
  estimateMinutes: number | null;
}

// One recorded ISSUE_STATUS_CHANGED. `from` is the state *before* the change —
// the field that makes replay exact instead of assumed.
export interface StatusTransition {
  issueId: string;
  from: string | null;
  to: string | null;
  at: Date;
}

export interface BurndownPoint {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  remaining: number;
  /** Straight reference line, scope → 0 across the same days. */
  ideal: number;
}

// Why a line never moved. A flat burndown reads as a broken chart, so the
// series says which of the three real causes produced it rather than leaving
// the reader to guess (ADR-0037 §4).
export type BurndownFlatReason =
  // Cohort issues exist and carry size, but none reached Done inside the window.
  | "NOTHING_COMPLETED"
  // Everything was already Done before the sprint began — usually a sprint
  // whose completions predate recorded status history.
  | "ALL_DONE_BEFORE"
  // Issues exist but none carries a value for the chosen unit.
  | "NO_SIZE";

export interface BurndownSeries {
  unit: BurndownUnit;
  scope: number;
  points: BurndownPoint[];
  /** Cohort issues carrying no value for this unit — the line is a floor. */
  unsized: number;
  /** Done now, but with no recorded DONE transition (see ADR-0037 §4). */
  untrackedDone: number;
  issueCount: number;
  /** Null when the line actually moves. */
  flatReason: BurndownFlatReason | null;
}

const DONE = "DONE";
const MS_PER_DAY = 86_400_000;

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** The last instant of that UTC day — the moment we sample each issue's state. */
function endOfUtcDay(day: Date): Date {
  return new Date(day.getTime() + MS_PER_DAY - 1);
}

function isoDay(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/**
 * The issue's status at `at`, reconstructed exactly:
 *   1. the `to` of the latest transition at or before `at`; else
 *   2. the `from` of the earliest transition — the true prior state, so no
 *      starting status is ever guessed; else
 *   3. `current`, because the issue has never changed status.
 *
 * `transitions` must be ascending by `at` and already filtered to this issue.
 */
export function statusAt(
  current: string,
  transitions: StatusTransition[],
  at: Date,
): string {
  let latest: StatusTransition | undefined;
  for (const t of transitions) {
    if (t.at.getTime() > at.getTime()) break;
    latest = t;
  }
  if (latest) return latest.to ?? current;

  const earliest = transitions[0];
  if (earliest && earliest.from) return earliest.from;
  return current;
}

export function sizeOf(issue: BurndownIssue, unit: BurndownUnit): number {
  switch (unit) {
    case "points":
      return issue.storyPoints ?? 0;
    case "hours":
      // Minutes; the axis formats them. Kept in minutes so no precision is lost
      // before the sum, exactly as the workload figures do.
      return issue.estimateMinutes ?? 0;
    case "issues":
      return 1;
  }
}

/** An issue contributes nothing to this unit — counted, never imputed. */
function isUnsized(issue: BurndownIssue, unit: BurndownUnit): boolean {
  if (unit === "issues") return false;
  return unit === "points" ? issue.storyPoints === null : issue.estimateMinutes === null;
}

/** UTC days from `from` to `to` inclusive, capped so an active sprint stops today. */
export function burndownDays(from: Date, to: Date, now: Date): Date[] {
  const start = startOfUtcDay(from);
  const today = startOfUtcDay(now);
  const rawEnd = startOfUtcDay(to);
  const end = rawEnd.getTime() > today.getTime() ? today : rawEnd;
  if (end.getTime() < start.getTime()) return [];

  const days: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += MS_PER_DAY) {
    days.push(new Date(t));
  }
  return days;
}

export function buildBurndown(
  issues: BurndownIssue[],
  transitions: StatusTransition[],
  sprint: { startDate: Date; endDate: Date },
  unit: BurndownUnit,
  now: Date,
): BurndownSeries {
  const byIssue = new Map<string, StatusTransition[]>();
  for (const t of transitions) {
    const list = byIssue.get(t.issueId);
    if (list) list.push(t);
    else byIssue.set(t.issueId, [t]);
  }
  // The caller orders by createdAt, but a burndown must not depend on a query's
  // ORDER BY to be correct.
  for (const list of byIssue.values()) list.sort((a, b) => a.at.getTime() - b.at.getTime());

  const scope = issues.reduce((sum, i) => sum + sizeOf(i, unit), 0);
  const unsized = issues.filter((i) => isUnsized(i, unit)).length;
  const untrackedDone = issues.filter(
    (i) => i.status === DONE && !(byIssue.get(i.id) ?? []).some((t) => t.to === DONE),
  ).length;

  // The ideal spans the sprint as planned, even when today truncates the drawn
  // series — otherwise a sprint viewed on day 2 would show an ideal that hits
  // zero on day 2.
  const plannedDays = burndownDays(sprint.startDate, sprint.endDate, sprint.endDate);
  const lastIdealIndex = Math.max(plannedDays.length - 1, 1);

  const points = burndownDays(sprint.startDate, sprint.endDate, now).map((day, index) => {
    const at = endOfUtcDay(day);
    const remaining = issues.reduce((sum, issue) => {
      const status = statusAt(issue.status, byIssue.get(issue.id) ?? [], at);
      return status === DONE ? sum : sum + sizeOf(issue, unit);
    }, 0);
    return {
      day: isoDay(day),
      remaining,
      ideal: Math.max(scope - (scope * index) / lastIdealIndex, 0),
    };
  });

  return {
    unit,
    scope,
    points,
    unsized,
    untrackedDone,
    issueCount: issues.length,
    flatReason: flatReason(points, scope, issues.length),
  };
}

function flatReason(
  points: BurndownPoint[],
  scope: number,
  issueCount: number,
): BurndownFlatReason | null {
  if (points.length === 0 || issueCount === 0) return null;
  const moved = points.some((p) => p.remaining !== points[0]!.remaining);
  if (moved) return null;

  if (scope === 0) return "NO_SIZE";
  return points[0]!.remaining === 0 ? "ALL_DONE_BEFORE" : "NOTHING_COMPLETED";
}
