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

/**
 * The ceiling on the result count (BR-9a).
 *
 * A count is bounded work or it is a liability: `COUNT(*)` over an unbounded
 * filtered set is fine at 7,300 issues and is a sequential scan at 5,000,000.
 * Past this many matches the exact number stops being information anybody acts
 * on — nobody pages to 200,001 — so the query stops counting and the UI says
 * "10,000+". Jira and GitHub both cap for the same reason.
 */
export const COUNT_CAP = 10_000;

export interface IssueQueryResultDto {
  items: CrossProjectIssueDto[];
  /** Keyset cursor for the next page, or null at the end (BR-9). */
  nextCursor: string | null;
  /**
   * How many issues match the filter — the denominator in "1–50 of 7,300".
   *
   * Capped at `COUNT_CAP`: when `totalCountCapped` is true this is the cap and
   * the real number is higher, so the UI must render "10,000+" and must not
   * compute a page count from it. Retrieval is still keyset — this is a
   * denominator, not a new way to fetch rows.
   */
  totalCount: number;
  /** True when the match count reached `COUNT_CAP` and counting stopped. */
  totalCountCapped: boolean;
  /**
   * How many projects the query actually read, after the membership
   * intersection. Surfaced so "0 results" can distinguish "nothing matches"
   * from "you are not in any of this view's projects" (BR-3).
   */
  projectsInScope: number;
}
