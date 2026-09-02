import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// DTOs for saved views and the cross-project issue list (ADR-0040,
// docs/02_Modules/22_saved_views.md). Never the raw Prisma model.

export type SavedViewVisibilityDto = "PRIVATE" | "SHARED";

export type SavedViewSortDto =
  | "UPDATED_DESC"
  | "UPDATED_ASC"
  | "CREATED_DESC"
  | "CREATED_ASC"
  | "DUE_DATE_ASC"
  | "DUE_DATE_DESC"
  | "PRIORITY_DESC"
  | "PRIORITY_ASC"
  | "KEY_ASC";

export const DEFAULT_SORT: SavedViewSortDto = "UPDATED_DESC";

export interface SavedViewDto {
  id: string;
  name: string;
  filter: IssueFilter;
  sort: SavedViewSortDto;
  visibility: SavedViewVisibilityDto;
  /** Whose it is — shown on shared views so a reader knows who to ask. */
  owner: { id: string; name: string };
  /** The caller's own, or they are an org admin (BR-5). Drives the UI. */
  canEdit: boolean;
  /**
   * The stored filter failed to parse and was replaced with an empty one
   * (BR-8). The view still opens; it says so instead of 500ing.
   */
  filterCorrupt: boolean;
}

/** A cross-project row: the project is the one thing a scoped list never needs. */
export interface CrossProjectIssueDto extends IssueListItemDto {
  projectKey: string;
  projectName: string;
}

/**
 * Page size, here rather than in the repository because the pagination control
 * is a client component and importing a `*.repository.ts` into one would drag
 * Prisma into the browser bundle (Feature Architecture §4). The repository and
 * the service both read these from here, so there is still one definition.
 */
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export interface IssueQueryResultDto {
  items: CrossProjectIssueDto[];
  /** Keyset cursor for the next page, or null at the end (BR-9). */
  nextCursor: string | null;
  /**
   * How many projects the query actually read, after the membership
   * intersection. Surfaced so "0 results" can distinguish "nothing matches"
   * from "you are not in any of this view's projects" (BR-3).
   */
  projectsInScope: number;
}
