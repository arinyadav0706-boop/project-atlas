// DTOs for bulk edit (ADR-0041, docs/02_Modules/23_bulk_edit.md).

/** Why one issue could not be changed. Machine-readable, so the UI can group. */
export type BulkFailureReason =
  | "not_found"
  | "forbidden"
  | "archived"
  | "invalid_transition"
  | "invalid_assignee"
  | "invalid_sprint"
  /** A parent moved to Done while a subtask is still open (26_subtasks BR-7). */
  | "open_subtasks"
  | "conflict";

export type BulkOutcome = "updated" | "skipped" | "failed";

export interface BulkResultItemDto {
  issueId: string;
  /** Present whenever the issue was readable — the reader thinks in keys. */
  key: string | null;
  outcome: BulkOutcome;
  reason?: BulkFailureReason;
  /** Human-readable, already phrased for display. */
  message?: string;
}

export interface BulkEditResultDto {
  updated: number;
  /** Already held every requested value; nothing written, nothing audited. */
  skipped: number;
  failed: number;
  results: BulkResultItemDto[];
  /**
   * Assignment notifications were capped (BR-13). Surfaced so the UI can say
   * so rather than leaving people wondering why they were not told.
   */
  notificationsSuppressed: boolean;
}
