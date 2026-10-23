import type { IssueListItemDto } from "@/features/issues/types/issue.types";
import type { PersonalWorkloadDto } from "@/features/workload/types/workload.types";

// DTOs for the Home landing page (ADR-0057, docs/02_Modules/02_home.md). Home
// has a CLOSED set of nine panels; future modules feed these, never adding new
// ones. Panels whose data does not exist yet are absent, not faked (BR-12).

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

/** BR-15. `doneCount ÷ issueCount` is the card's progress; zero issues is 0%. */
export interface HomeProjectStatsDto {
  issueCount: number;
  doneCount: number;
  activeSprints: number;
  memberCount: number;
}

// Lean project shape for the Home navigation strip (not the catalog).
export interface HomeProjectDto {
  id: string;
  key: string;
  name: string;
  /** Shown as the tile's second line; null renders a neutral placeholder. */
  description: string | null;
  starred: boolean;
  stats: HomeProjectStatsDto;
}

/** BR-13: which list the My Work panel shows, from the `work` URL parameter. */
export type HomeWorkTab = "assigned" | "reported" | "mentioned";

/** BR-14: which events Recent activity shows, from the `activity` URL parameter. */
export type HomeActivityTab = "all" | "comments" | "status" | "assignments";

export interface ActivityPersonDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

interface ActivityBase {
  /** Source-namespaced ("comment:<id>", "audit:<id>") for React keys. */
  id: string;
  occurredAt: string; // ISO
  /** "3h ago", decided by the service against one request clock. */
  occurredAgo: string;
  /** Null when no person did it — a rule's comment, or an actor since removed. */
  actor: ActivityPersonDto | null;
  issue: { id: string; key: string; title: string; projectId: string };
  href: string;
}

// One event in Recent activity (BR-14). A union rather than one bag of
// optional fields, so a status row can never render without its status.
export type ActivityItemDto =
  | (ActivityBase & { kind: "COMMENT"; excerpt: string })
  | (ActivityBase & { kind: "STATUS"; status: string })
  | (ActivityBase & { kind: "ASSIGNMENT"; assignee: ActivityPersonDto | null; toMe: boolean });

/** BR-16. `date` is a calendar day the reader acts on, ISO. */
export interface UpcomingItemDto {
  id: string;
  kind: "DUE" | "SPRINT_START" | "SPRINT_END";
  date: string;
  title: string;
  /** Issue key or project name — what the date belongs to. */
  context: string;
  href: string;
}

/**
 * The Summary row (BR-10): counts over the caller's assigned issues in their
 * member projects. No trend fields — there is no weekly history to compare
 * against, and a delta with an invented baseline is worse than none (BR-12).
 */
export interface HomeSummaryDto {
  open: number;
  /** Due within the Your-focus window, or already overdue. */
  dueThisWeek: number;
  inProgress: number;
  inReview: number;
  /** Open, with an open BLOCKS link pointing at it (ADR-0046 §3). */
  blocked: number;
  /** Entered a DONE-category status in the last 30 days, per the audit log. */
  completedLast30Days: number;
}

// One composed payload for the whole page. Sections depending on not-yet-built
// modules return [] — the contract is stable from day one.
export interface HomeDto {
  summary: HomeSummaryDto;
  myWork: HomeList<IssueListItemDto>;
  attention: HomeList<AttentionItemDto>;
  continueWorking: IssueListItemDto[];
  /** Due soon first, then the highest-priority open work (BR-11). */
  focus: HomeList<IssueListItemDto>;
  activity: HomeList<ActivityItemDto>;
  upcoming: UpcomingItemDto[];
  workload: PersonalWorkloadDto;
  starredProjects: HomeProjectDto[];
  recentProjects: HomeProjectDto[];
}
