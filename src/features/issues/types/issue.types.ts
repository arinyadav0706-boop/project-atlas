// DTOs returned to the client — never the raw Prisma model.

export type IssueTypeDto = "EPIC" | "STORY" | "TASK" | "BUG";
export type IssueStatusDto = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type IssuePriorityDto =
  | "LOWEST"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "HIGHEST";

export interface IssueAssigneeDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

// Lean shape for the list view.
export interface IssueListItemDto {
  id: string;
  key: string;
  type: IssueTypeDto;
  title: string;
  status: IssueStatusDto;
  priority: IssuePriorityDto;
  assignee: IssueAssigneeDto | null;
  storyPoints: number | null;
  updatedAt: string;
}

// Per-status totals for the filter chips (ALL = sum). Always present so the
// UI never guesses counts from a partial, paginated list.
export type IssueStatusCounts = Record<IssueStatusDto, number> & { ALL: number };

// One page of issues plus the cursor for the next page (null = last page).
export interface IssueListPageDto {
  items: IssueListItemDto[];
  nextCursor: string | null;
  counts: IssueStatusCounts;
}

// Full shape for the detail view.
export interface IssueDetailDto extends IssueListItemDto {
  description: string | null;
  reporter: IssueAssigneeDto | null;
  epicId: string | null;
  dueDate: string | null;
  createdAt: string;
  // The viewer's permissions on this issue, resolved server-side so the UI
  // never guesses.
  canEdit: boolean;
  canDelete: boolean;
  // Legal next statuses from the current one (fixed workflow).
  allowedStatuses: IssueStatusDto[];
}
