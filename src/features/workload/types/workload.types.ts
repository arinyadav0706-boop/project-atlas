// DTOs returned to the client — never the raw Prisma model.
// Model and rules: docs/02_Modules/21_workload.md (ADR-0034).

export type WorkloadStatus = "IDLE" | "LIGHT" | "BALANCED" | "OVERLOADED";

// A team the caller may inspect (BR-8).
export interface WorkloadTeamDto {
  id: string;
  name: string;
  memberCount: number;
}

// One person's load across every project (BR-1..BR-6).
export interface WorkloadRowDto {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  openIssues: number;
  // Open issues carrying no estimate: counted, never guessed (BR-4).
  unestimated: number;
  estimatedMinutes: number;
  loggedMinutes: number;
  remainingMinutes: number;
  weeksOfWork: number;
  status: WorkloadStatus;
}

// ── Project balance (BR-16) ─────────────────────────────────────────────────
// The same open issues as `rows`, regrouped by project. A regrouping, not a
// second query, so the two views cannot disagree about how much work exists.

// Whose load a project's remaining effort is. `status` is the person's
// team-wide band, not a per-project one: a project bar made of red segments
// means its work sits on people who are already over across everything they
// own, which is the thing worth spotting.
export interface WorkloadProjectSegmentDto {
  userId: string;
  name: string;
  minutes: number;
  status: WorkloadStatus;
}

export interface WorkloadProjectDto {
  projectId: string;
  key: string;
  name: string;
  openIssues: number;
  unestimated: number;
  remainingMinutes: number;
  // Distinct team members holding open work here — the divisor below.
  people: number;
  // A spread, not a forecast: how the queue would sit if this project's work
  // were split evenly among the people already on it (BR-16).
  weeksPerPerson: number;
  segments: WorkloadProjectSegmentDto[];
}

export interface WorkloadTotalsDto {
  people: number;
  openIssues: number;
  unestimated: number;
  remainingMinutes: number;
  overloaded: number;
  idle: number;
}

// The organization's working week, so the UI can state the basis of every
// number instead of implying a universal 40-hour week.
export interface WorkingWeekDto {
  minutesPerDay: number;
  daysPerWeek: number;
  weeklyMinutes: number;
  label: string; // e.g. "8h × 5 days = 40h week"
}

// ── The time-phased grid (ADR-0035) ─────────────────────────────────────────
// The same effort as `rows`, redistributed across calendar weeks. Nothing is
// invented or dropped: every row's cells sum to its `totalMinutes`, which is
// the `remainingMinutes` the list view shows for that person.

export interface WorkloadWeekDto {
  // ISO date of the week's Monday (UTC).
  start: string;
  // "Aug 3–7" — a real week the reader can find in their own calendar, never
  // "+2 wk" (ADR-0035 §3).
  label: string;
  isCurrent: boolean;
}

export interface WorkloadGridCellDto {
  minutes: number;
  // Share of that person's weekly capacity. The cell prints hours and colours
  // by this, so magnitude and pressure are both readable (ADR-0035 §4).
  percentOfCapacity: number;
  // Some of this effort was placed from SPRINT dates, not the issue's own —
  // rendered as Jira's "S" so an inferred number is visibly inferred (§5).
  inferred: boolean;
}

export interface WorkloadGridRowDto {
  userId: string;
  name: string;
  avatarUrl: string | null;
  overdue: WorkloadGridCellDto;
  weeks: WorkloadGridCellDto[];
  // Effort spreading past the last week column. Our horizon is fixed where
  // ClickUp's and Asana's scroll, so this is what keeps the totals honest.
  later: WorkloadGridCellDto;
  // No dates anywhere, so no week to sit in. Deliberately not a percentage:
  // there is no time period to compare it against.
  unscheduledMinutes: number;
  totalMinutes: number;
}

export interface WorkloadGridDto {
  weeks: WorkloadWeekDto[];
  rows: WorkloadGridRowDto[];
  // Both columns are shown only when they carry something (ADR-0035 §3).
  hasOverdue: boolean;
  hasLater: boolean;
  hasInferred: boolean;
  weeklyCapacityMinutes: number;
}

export interface WorkloadDto {
  teams: WorkloadTeamDto[];
  selectedTeamId: string | null;
  rows: WorkloadRowDto[];
  grid: WorkloadGridDto;
  // Most remaining effort first (BR-16).
  projects: WorkloadProjectDto[];
  totals: WorkloadTotalsDto;
  workingWeek: WorkingWeekDto;
}

// One row of the person drill-in (BR-11).
export interface WorkloadIssueDto {
  id: string;
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  projectId: string;
  projectKey: string;
  projectName: string;
  estimateMinutes: number | null;
  loggedMinutes: number;
  remainingMinutes: number;
  dueDate: string | null;
}
