import type {
  IssuePriorityDto,
  IssueStatusDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";

// DTOs for the Timeline (ADR-0047, docs/02_Modules/28_timeline.md).
//
// Dates cross the wire as `YYYY-MM-DD`, not ISO instants: a due date is a DAY,
// and shipping it as `2026-08-14T00:00:00.000Z` invites a client to render it
// in local time and land on the 13th for half the org.

export interface TimelineRowDto {
  id: string;
  key: string;
  title: string;
  type: IssueTypeDto;
  status: IssueStatusDto;
  priority: IssuePriorityDto;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  /** `YYYY-MM-DD`. Null only for a row in the unscheduled tray. */
  startDate: string | null;
  dueDate: string | null;
  version: number;
  /**
   * The bar is computed from this Epic's children, not stored on it (BR-6).
   *
   * Read-only in the UI: dragging a number derived from other numbers is a
   * control that cannot do what it appears to.
   */
  rolledUp: boolean;
  /** Open blockers — the same count the board badge shows. */
  blockedBy: number;
}

/** One `BLOCKS` edge, as the chart needs it (BR-7). */
export interface TimelineLinkDto {
  id: string;
  /** The issue that must finish first. */
  blockerId: string;
  /** The issue waiting on it. */
  dependentId: string;
  /**
   * The blocker finishes after the dependent starts, so the plan cannot happen
   * in the order it claims (BR-8). Computed server-side against one clock.
   */
  conflict: boolean;
}

/** A sprint drawn as a band behind the bars (BR-9). */
export interface TimelineSprintDto {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
}

export interface TimelineDto {
  rows: TimelineRowDto[];
  /** Undated issues, for the tray (BR-12). */
  unscheduled: TimelineRowDto[];
  sprints: TimelineSprintDto[];
  links: TimelineLinkDto[];
  /** How many conflicts among `links` — the header's count. */
  conflictCount: number;
  /**
   * The row cap bit (BR-10). The UI says so and points at the filter rather
   * than quietly showing a subset, which is the version people misread.
   */
  truncated: boolean;
  /** Whether the viewer may drag anything at all. */
  canEdit: boolean;
}
