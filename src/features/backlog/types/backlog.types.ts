import type { IssueListItemDto } from "@/features/issues/types/issue.types";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";

// The Backlog is a view over issues (ADR-0013): the project's unscheduled
// issues (`sprintId = null`), ordered by the single shared `rank` (ADR-0009),
// independent of status. Reuses the shared issue card DTO — no bespoke shape.
export interface BacklogDto {
  // One keyset-paginated page, already ordered by `rank`.
  items: IssueListItemDto[];
  // Cursor for the next page (null = last page). Backlogs grow large, so the
  // list is always bounded (Performance doc, standard #1).
  nextCursor: string | null;
  // Whether the viewer may drag to reorder (MEMBER/LEAD). VIEWER is read-only.
  canWrite: boolean;
  // Total matching the active filter, across all pages. The list is keyset-
  // paginated, so the page length alone cannot answer "how many matched?".
  total: number;
  // The filter the server actually applied, echoed back (same contract as the
  // Board's `appliedFilter`).
  appliedFilter: IssueFilter;
}
