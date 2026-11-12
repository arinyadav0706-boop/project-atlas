// Pure timesheet rules (37_timesheets BR-10, BR-13–16, BR-24). No I/O: the
// service gathers the inputs, these decide, and unit tests pin each rule.

import { addDays, weekday, type IsoDate } from "@/features/timesheets/lib/period";

// ── Billable (BR-10) ─────────────────────────────────────────────────────────

export interface BillableInputs {
  override: boolean | null;
  issueDefault: boolean | null;
  activityDefault: boolean | null;
  projectDefault: boolean | null;
  clientDefault: boolean | null;
  policyDefault: boolean;
}

// Row override → issue or activity → project → client → policy. A row is an
// issue or an activity, never both, so at most one of those two is set.
export function resolveBillable(i: BillableInputs): boolean {
  return (
    i.override ??
    i.issueDefault ??
    i.activityDefault ??
    i.projectDefault ??
    i.clientDefault ??
    i.policyDefault
  );
}

// ── Expected minutes per day (BR-13, BR-14) ─────────────────────────────────

export type DayKind = "WORKING" | "WEEKEND" | "HOLIDAY" | "LEAVE";

export interface DayPlan {
  date: IsoDate;
  kind: DayKind;
  label: string | null;
  expectedMinutes: number;
}

export interface ExpectedInputs {
  days: IsoDate[];
  weekStartDay: number;
  workingMinutesPerDay: number;
  workingDaysPerWeek: number;
  hrConnected: boolean;
  holidays: ReadonlyMap<IsoDate, string>;
  // Approved leave per day, in minutes.
  leave: ReadonlyMap<IsoDate, { minutes: number; type: string }>;
}

// The first `workingDaysPerWeek` days of each week (counted from the policy's
// week start) are working days — the Workload basis (ADR-0034). Holidays and
// leave reduce them only when HR is connected; until then they are not even
// shown, because a holiday nobody synced is a holiday we cannot vouch for.
export function planDays(i: ExpectedInputs): DayPlan[] {
  return i.days.map((date) => {
    const dayIndex = (weekday(date) - i.weekStartDay + 7) % 7;
    if (dayIndex >= i.workingDaysPerWeek) {
      return { date, kind: "WEEKEND", label: null, expectedMinutes: 0 };
    }
    if (i.hrConnected) {
      const holiday = i.holidays.get(date);
      if (holiday !== undefined) return { date, kind: "HOLIDAY", label: holiday, expectedMinutes: 0 };
      const leave = i.leave.get(date);
      if (leave) {
        return {
          date,
          kind: "LEAVE",
          label: leave.type,
          expectedMinutes: Math.max(0, i.workingMinutesPerDay - leave.minutes),
        };
      }
    }
    return { date, kind: "WORKING", label: null, expectedMinutes: i.workingMinutesPerDay };
  });
}

// BR-15: a flag, never a block. Null threshold = the organization's day.
export function isOvertime(
  dayTotal: number,
  overtimeDailyMinutes: number | null,
  workingMinutesPerDay: number,
): boolean {
  return dayTotal > (overtimeDailyMinutes ?? workingMinutesPerDay);
}

// ── Submit problems (BR-24) ──────────────────────────────────────────────────

export type ProblemCode =
  | "NOTE_REQUIRED"
  | "PROJECT_REQUIRED"
  | "CLIENT_REQUIRED"
  | "DAY_OVER_24H"
  | "EMPTY_WEEK";

export interface Problem {
  code: ProblemCode;
  message: string;
  rowId: string | null;
  date: IsoDate | null;
}

export interface ProblemRow {
  id: string;
  label: string;
  isActivity: boolean;
  billable: boolean;
  activityNotesRequired: boolean;
  requiresProject: boolean;
  requiresClient: boolean;
  hasProject: boolean;
  hasClient: boolean;
  cells: { date: IsoDate; minutes: number; notes: (string | null)[] }[];
}

export interface ProblemInputs {
  rows: ProblemRow[];
  notesRequired: "NONE" | "BILLABLE" | "ALL";
  // ADR-0059 Q14: off until the Clients admin screen exists (TS-5).
  enforceClientRequirement: boolean;
}

const DAY_LIMIT = 1440;

function shortDate(date: IsoDate): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function findProblems(i: ProblemInputs): Problem[] {
  const out: Problem[] = [];
  const dayTotals = new Map<IsoDate, number>();
  let total = 0;

  for (const row of i.rows) {
    const rowMinutes = row.cells.reduce((s, c) => s + c.minutes, 0);
    total += rowMinutes;
    for (const c of row.cells) dayTotals.set(c.date, (dayTotals.get(c.date) ?? 0) + c.minutes);

    if (row.isActivity && rowMinutes > 0) {
      if (row.requiresProject && !row.hasProject) {
        out.push({
          code: "PROJECT_REQUIRED",
          message: `${row.label} → select a project for this activity`,
          rowId: row.id,
          date: null,
        });
      }
      if (i.enforceClientRequirement && row.requiresClient && !row.hasClient) {
        out.push({
          code: "CLIENT_REQUIRED",
          message: `${row.label} → select a client for this activity`,
          rowId: row.id,
          date: null,
        });
      }
    }

    const noteNeeded =
      row.activityNotesRequired ||
      i.notesRequired === "ALL" ||
      (i.notesRequired === "BILLABLE" && row.billable);
    if (noteNeeded) {
      for (const c of row.cells) {
        if (c.minutes > 0 && c.notes.some((n) => !n || !n.trim())) {
          out.push({
            code: "NOTE_REQUIRED",
            message: `${row.label} → ${shortDate(c.date)}`,
            rowId: row.id,
            date: c.date,
          });
        }
      }
    }
  }

  for (const [date, minutes] of [...dayTotals].sort(([a], [b]) => a.localeCompare(b))) {
    if (minutes > DAY_LIMIT) {
      out.push({ code: "DAY_OVER_24H", message: `${shortDate(date)} totals more than 24h`, rowId: null, date });
    }
  }

  if (total === 0) {
    out.push({ code: "EMPTY_WEEK", message: "Nothing is logged this week", rowId: null, date: null });
  }
  return out;
}

export function periodEndFor(periodStart: IsoDate): IsoDate {
  return addDays(periodStart, 6);
}
