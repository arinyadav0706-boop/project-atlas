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
  // The owning project — needed to link an issue from cross-project surfaces
  // (Home). Within-project views already know it but carrying it is harmless.
  projectId: string;
  key: string;
  type: IssueTypeDto;
  title: string;
  status: IssueStatusDto;
  priority: IssuePriorityDto;
  assignee: IssueAssigneeDto | null;
  storyPoints: number | null;
  updatedAt: string;
  // Optimistic-concurrency token (ADR-0011). The client sends this back on a
  // reorder; a stale value is rejected instead of silently overwriting.
  version: number;
  // Classification chips (ADR-0018). Optional so list mappers that don't need
  // them (Home, list, backlog) stay untouched; the Board populates them.
  labels?: { id: string; name: string; color: string }[];
  components?: { id: string; name: string }[];
  // Parent epic key for the card's epic badge (ADR-0026). Optional — populated
  // by the Board mapper; other list mappers leave it undefined.
  epicKey?: string;
}

// Parent-epic summary shown on a child's detail (ADR-0026).
export interface EpicSummaryDto {
  id: string;
  key: string;
  title: string;
}

// A child issue shown on an epic's detail (ADR-0026).
export interface IssueChildDto {
  id: string;
  key: string;
  title: string;
  type: IssueTypeDto;
  status: IssueStatusDto;
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
  // Hierarchy (ADR-0026): the parent epic (for a child) and the child issues
  // (for an epic). `epic` is null when the issue has no parent; `children` is
  // empty for non-epics (and populated only on the detail GET).
  epic: EpicSummaryDto | null;
  children: IssueChildDto[];
  dueDate: string | null;
  createdAt: string;
  // The viewer's permissions on this issue, resolved server-side so the UI
  // never guesses.
  canEdit: boolean;
  canDelete: boolean;
  // Legal next statuses from the current one (fixed workflow).
  allowedStatuses: IssueStatusDto[];
}
