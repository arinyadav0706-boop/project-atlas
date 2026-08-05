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

export interface WorkloadTotalsDto {
  people: number;
  openIssues: number;
  unestimated: number;
  remainingMinutes: number;
  overloaded: number;
  idle: number;
}

export interface WorkloadDto {
  teams: WorkloadTeamDto[];
  selectedTeamId: string | null;
  rows: WorkloadRowDto[];
  totals: WorkloadTotalsDto;
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
