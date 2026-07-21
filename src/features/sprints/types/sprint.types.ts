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

// One sprint section in the planning view: the sprint plus its ordered issues.
export interface SprintSectionDto {
  sprint: SprintWithProgressDto;
  items: IssueListItemDto[];
}

// The Backlog page's planning view (ADR-0015): every non-completed sprint
// (ACTIVE first, then PLANNED by creation) as its own droppable section, plus
// the completed-sprint history and the viewer's permissions.
export interface SprintPanelDto {
  // ACTIVE first, then PLANNED (createdAt asc). Empty when the project has no
  // planned/active sprints.
  sprints: SprintSectionDto[];
  // Past (COMPLETED) sprints for the history section, most-recent first.
  completedSprints: SprintWithProgressDto[];
  // Whether the viewer may drag issues in/out (MEMBER/LEAD).
  canWrite: boolean;
  // Whether the viewer may create/start/complete/edit/delete sprints (LEAD,
  // BR-4). Carried at the panel level so the "Create sprint" control shows even
  // when there are no sprints yet.
  canManage: boolean;
}
