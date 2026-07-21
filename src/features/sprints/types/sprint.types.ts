import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// DTOs returned to the client — never the raw Prisma model.

export type SprintStatusDto = "PLANNED" | "ACTIVE" | "COMPLETED";

export interface SprintDto {
  id: string;
  projectId: string;
  name: string;
  goal: string | null;
  status: SprintStatusDto;
  startDate: string | null;
  endDate: string | null;
}

// Basic progress, derived at read time (GROUP BY status) — never stored
// (ADR-0014, BR-7). Story-point totals feed the future velocity report.
export interface SprintProgressDto {
  totalIssues: number;
  doneIssues: number;
  totalStoryPoints: number;
  doneStoryPoints: number;
}

export interface SprintWithProgressDto extends SprintDto {
  progress: SprintProgressDto;
  // Whether the viewer may create/start/complete/edit sprints (LEAD, BR-4),
  // resolved server-side so the UI never guesses.
  canManage: boolean;
}

// The Backlog page's planning view (ADR-0014): the project's current sprint (if
// any) with its ordered issues, plus whether the viewer may drag (MEMBER/LEAD).
export interface SprintPanelDto {
  sprint: SprintWithProgressDto | null;
  items: IssueListItemDto[];
  // Whether the viewer may drag issues in/out (MEMBER/LEAD).
  canWrite: boolean;
  // Whether the viewer may create/start/complete sprints (LEAD, BR-4). Carried
  // at the panel level so the "Create sprint" control shows even when there is
  // no sprint yet (can't be read off a null sprint).
  canManage: boolean;
}
