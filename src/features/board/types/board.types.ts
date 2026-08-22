import type {
  IssueListItemDto,
  IssueStatusCounts,
  } from "@/features/issues/types/issue.types";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type { WorkflowStatusDto } from "@/features/workflow/types/workflow.types";

// The Board is a project-level view; scope is a composable, extensible filter
// layered on top — never a separate board (ADR-0008).
//
// The shape itself now lives in `features/issues` as `IssueFilter`, because the
// Board was its first consumer but is not its owner: Backlog reads the same
// type and the same `where` builder. `BoardFilter` stays as the Board's name
// for it so existing call sites and docs keep reading naturally.
export type BoardFilter = IssueFilter;

// One status column, its cards already ordered by `rank` (ADR-0009).
//
// A column IS a project status now (30_workflow BR-1), not one of four fixed
// values: a team can have "Triage", "Blocked" and "In QA" and the board has to
// draw them. `category` rides along because the card colouring, the
// done-confirmation and the reports all reason about the category, not the name.
export interface BoardColumnDto {
  status: WorkflowStatusDto;
  items: IssueListItemDto[];
  /** Live total in this column under the active filter — the column is capped. */
  count: number;
}

export interface BoardDto {
  // The project's statuses, in the order the team put them in.
  columns: BoardColumnDto[];
  // Per-status totals under the active filter (ALL = sum), so counts stay
  // accurate even though each column is capped.
  counts: IssueStatusCounts;
  // The filter the server actually applied, echoed for the client to render.
  appliedFilter: BoardFilter;
  // Whether the viewer may drag (MEMBER/LEAD). VIEWER sees a read-only board.
  canWrite: boolean;
}
