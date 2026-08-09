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
  myWork: IssueListItemDto[];
  attention: AttentionItemDto[];
  continueWorking: IssueListItemDto[];
  dueSoon: IssueListItemDto[];
  starredProjects: HomeProjectDto[];
  recentProjects: HomeProjectDto[];
}
