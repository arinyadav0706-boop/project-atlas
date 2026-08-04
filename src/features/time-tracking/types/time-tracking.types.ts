// DTOs returned to the client — never the raw Prisma model.

export interface WorkLogUserDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface WorkLogDto {
  id: string;
  issueId: string;
  minutes: number;
  // The day the work was done, as YYYY-MM-DD (date-only, no timezone).
  workDate: string;
  note: string | null;
  user: WorkLogUserDto;
  createdAt: string;
  // Optimistic-concurrency token (ADR-0011); sent back on edit.
  version: number;
  // The viewer's rights on this log, resolved server-side (BR-3/BR-4).
  canEdit: boolean;
  canDelete: boolean;
}

// Per-issue effort summary (BR-6). `remainingMinutes` is null when no estimate
// is set, and may be negative when logged time exceeds the estimate (over).
export interface TimeSummaryDto {
  estimateMinutes: number | null;
  loggedMinutes: number;
  remainingMinutes: number | null;
}

// One keyset-paginated page of an issue's work logs (newest-first) + summary.
export interface WorkLogPageDto {
  items: WorkLogDto[];
  nextCursor: string | null;
  summary: TimeSummaryDto;
  // Whether the viewer may log time / set the estimate (MEMBER|LEAD, non-archived).
  canLog: boolean;
  canSetEstimate: boolean;
}
