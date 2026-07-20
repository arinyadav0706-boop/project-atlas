import type { IssueListItemDto } from "@/features/issues/types/issue.types";

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
}
