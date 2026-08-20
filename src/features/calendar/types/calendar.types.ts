import type {
  IssuePriorityDto,
  IssueStatusDto,
  IssueTypeDto,
} from "@/features/issues/types/issue.types";

// DTOs for the Calendar (ADR-0048, docs/02_Modules/29_calendar.md).
//
// Dates cross the wire as `YYYY-MM-DD`, never ISO instants: a due date is a
// DAY, and shipping `2026-08-14T00:00:00.000Z` invites a client to render it in
// local time and drop it in the 13th's cell for half the org (BR-11).

export interface CalendarEventDto {
  id: string;
  key: string;
  title: string;
  type: IssueTypeDto;
  status: IssueStatusDto;
  priority: IssuePriorityDto;
  assignee: { id: string; name: string; avatarUrl: string | null } | null;
  /** `YYYY-MM-DD`. Null for an event in the unscheduled panel. */
  startDate: string | null;
  dueDate: string | null;
  /** For the optimistic-concurrency check on a drag (ADR-0011). */
  version: number;
  /** Open blockers — the same count the board badge shows. */
  blockedBy: number;
}

export interface CalendarDto {
  /** Inclusive window actually queried, echoed back so the client can trust it. */
  from: string;
  to: string;
  events: CalendarEventDto[];
  /** Undated issues, for the drag-onto-a-day panel (BR-7). */
  unscheduled: CalendarEventDto[];
  /**
   * The event cap bit (BR-12). The view says so and points at the filter rather
   * than quietly showing a subset, which is the version people misread.
   */
  truncated: boolean;
  /** Whether the viewer may drag anything at all (BR-9). */
  canEdit: boolean;
}
