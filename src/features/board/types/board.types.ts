import type {
  IssueListItemDto,
  IssuePriorityDto,
  IssueStatusCounts,
  IssueStatusDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";

// The Board is a project-level view; scope is a composable, extensible filter
// layered on top — never a separate board (ADR-0008). Any subset may be empty;
// present fields combine with AND. A new filter adds a field here and a control
// in the filter bar — no board redesign, no new query contract.
export interface BoardFilter {
  sprintId?: string;
  epicId?: string;
  assigneeId?: string;
  type?: IssueTypeDto;
  priority?: IssuePriorityDto;
  labelIds?: string[];
  search?: string;
}

// One status column, its cards already ordered by `rank` (ADR-0009).
export interface BoardColumnDto {
  status: IssueStatusDto;
  items: IssueListItemDto[];
}

export interface BoardDto {
  // Always the four columns, in workflow order (TODO → DONE).
  columns: BoardColumnDto[];
  // Per-status totals under the active filter (ALL = sum), so counts stay
  // accurate even though each column is capped.
  counts: IssueStatusCounts;
  // The filter the server actually applied, echoed for the client to render.
  appliedFilter: BoardFilter;
  // Whether the viewer may drag (MEMBER/LEAD). VIEWER sees a read-only board.
  canWrite: boolean;
}
