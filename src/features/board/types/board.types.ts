import type {
  IssueListItemDto,
  IssueStatusCounts,
  IssueStatusDto,
} from "@/features/issues/types/issue.types";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";

// The Board is a project-level view; scope is a composable, extensible filter
// layered on top — never a separate board (ADR-0008).
//
// The shape itself now lives in `features/issues` as `IssueFilter`, because the
// Board was its first consumer but is not its owner: Backlog reads the same
// type and the same `where` builder. `BoardFilter` stays as the Board's name
// for it so existing call sites and docs keep reading naturally.
export type BoardFilter = IssueFilter;

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
