import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// DTOs for the Home landing page (ADR-0012, docs/02_Modules/02_home.md). Home
// has a FIXED set of sections; future modules feed these, never adding new ones.

// Service-layer mirrors of the Prisma enums, so services/callers never import
// @prisma/client (Feature Architecture §2 — Prisma stays in *.repository.ts).
// Structurally identical to the enums, so they pass straight through to the repo.
export type RecentEntityTypeDto = "ISSUE" | "PROJECT";
export type FavoriteEntityTypeDto = "PROJECT";
export type InteractionTypeDto =
  | "VIEWED"
  | "ASSIGNED"
  | "MENTIONED"
  | "COMMENTED"
  | "TRANSITIONED"
  | "EDITED";

// Uniform shape for the "Needs your attention" stream, regardless of which
// AttentionSource produced the item. New kinds are added as modules ship.
export type AttentionKind =
  | "ASSIGNED" // newly assigned to me
  | "UPDATED" // an issue I own changed since I last looked
  | "MENTION" // future (comments)
  | "REVIEW_REQUEST" // future
  | "APPROVAL"; // future

export interface AttentionItemDto {
  // Stable, source-namespaced id (e.g. "updated:<issueId>") for React keys.
  id: string;
  kind: AttentionKind;
  title: string;
  href: string;
  actorId: string | null;
  occurredAt: string; // ISO
}

/**
 * A capped Home list, with the cap made visible.
 *
 * Every Home section shows the top N of something. The count in each panel
 * header used to be `items.length`, so somebody with forty open issues was
 * told they had ten — a floor presented as a fact, which is the same defect the
 * board had when it counted 137 above a list of 100. `truncated` is what turns
 * "10" into "10+".
 *
 * Not pagination: a launchpad's job is to show the top of a list and hand you
 * to the page that has all of it. The fix is an honest number and a link that
 * actually lands on the same question.
 */
export interface HomeList<T> {
  items: T[];
  /** There is at least one more beyond the cap. */
  truncated: boolean;
}

// Lean project shape for the Home navigation strip (not the catalog).
export interface HomeProjectDto {
  id: string;
  key: string;
  name: string;
  /** Shown as the tile's second line; null renders a neutral placeholder. */
  description: string | null;
  starred: boolean;
}

// One composed payload for the whole page. Sections depending on not-yet-built
// modules return [] — the contract is stable from day one.
export interface HomeDto {
  myWork: HomeList<IssueListItemDto>;
  attention: HomeList<AttentionItemDto>;
  continueWorking: IssueListItemDto[];
  dueSoon: HomeList<IssueListItemDto>;
  starredProjects: HomeProjectDto[];
  recentProjects: HomeProjectDto[];
}
