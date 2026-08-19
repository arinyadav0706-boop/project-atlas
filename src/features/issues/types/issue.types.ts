// DTOs returned to the client — never the raw Prisma model.

export type IssueTypeDto = "EPIC" | "STORY" | "TASK" | "BUG" | "SUBTASK";

/**
 * The types an issue can be created as directly.
 *
 * `SUBTASK` is absent on purpose (ADR-0045): a subtask cannot exist without a
 * parent, so it is created from one, never from a blank form.
 */
export const STANDALONE_ISSUE_TYPES = ["EPIC", "STORY", "TASK", "BUG"] as const;

/** Types that may parent a subtask (ADR-0045 §3). Never EPIC, never SUBTASK. */
export const SUBTASK_PARENT_TYPES = ["STORY", "TASK", "BUG"] as const;

export const isSubtask = (type: IssueTypeDto): boolean => type === "SUBTASK";
export type IssueStatusDto = "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";
export type IssuePriorityDto =
  | "LOWEST"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "HIGHEST";

export interface IssueAssigneeDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}

// Lean shape for the list view.
export interface IssueListItemDto {
  id: string;
  // The owning project — needed to link an issue from cross-project surfaces
  // (Home). Within-project views already know it but carrying it is harmless.
  projectId: string;
  key: string;
  type: IssueTypeDto;
  title: string;
  status: IssueStatusDto;
  priority: IssuePriorityDto;
  assignee: IssueAssigneeDto | null;
  storyPoints: number | null;
  updatedAt: string;
  /**
   * Optional, like the classification chips: only the surfaces that show a date
   * populate it. Home does — a row that says "Jul 25" is the difference between
   * a list and a plan.
   */
  dueDate?: string | null;
  /**
   * Whether `dueDate` is in the past, decided by the service against a single
   * request-time clock. The UI must not work this out itself: reading the clock
   * during render is impure, and two rows rendered a tick apart could disagree
   * about the same instant.
   */
  dueOverdue?: boolean;
  // Optimistic-concurrency token (ADR-0011). The client sends this back on a
  // reorder; a stale value is rejected instead of silently overwriting.
  version: number;
  // Classification chips (ADR-0018). Optional so list mappers that don't need
  // them (Home, list, backlog) stay untouched; the Board populates them.
  labels?: { id: string; name: string; color: string }[];
  components?: { id: string; name: string }[];
  // Parent epic for card badges + backlog grouping (ADR-0026). Optional —
  // populated by the Board/Backlog/Sprint mappers; others leave it undefined.
  epicKey?: string;
  epicId?: string | null;
  /**
   * The parent's key, on a subtask only (ADR-0045 §6).
   *
   * Populated by the surfaces that show subtasks alongside standalone issues —
   * the board and the cross-project list. Without it a board of subtasks is a
   * list of orphan sentences ("Write the tests" — for what?).
   */
  parentKey?: string;
  parentId?: string | null;
}

// Parent-epic summary shown on a child's detail (ADR-0026).
export interface EpicSummaryDto {
  id: string;
  key: string;
  title: string;
}

// A child issue shown on an epic's detail (ADR-0026).
export interface IssueChildDto {
  id: string;
  key: string;
  title: string;
  type: IssueTypeDto;
  status: IssueStatusDto;
}

/** The parent breadcrumb on a subtask's detail (ADR-0045 §3). */
export interface IssueParentDto {
  id: string;
  key: string;
  title: string;
  type: IssueTypeDto;
  status: IssueStatusDto;
}

/** One subtask row under its parent. Richer than `IssueChildDto` — a subtask
 *  is worked from the parent's page, so it needs its assignee and version. */
export interface SubtaskDto {
  id: string;
  key: string;
  title: string;
  status: IssueStatusDto;
  priority: IssuePriorityDto;
  assignee: IssueAssigneeDto | null;
  estimateMinutes: number | null;
  version: number;
}

/**
 * What a parent's subtasks add up to (BR-11).
 *
 * Counts and minutes only — never story points. Splitting a 5-point story into
 * a 3 and a 2 would make velocity say 10, so a subtask cannot carry points at
 * all (ADR-0045 §7).
 */
export interface SubtaskProgressDto {
  total: number;
  done: number;
  /** Parent + subtasks, in minutes. Null when nothing in the tree is estimated. */
  estimateMinutes: number | null;
}

export interface SubtaskListDto {
  items: SubtaskDto[];
  progress: SubtaskProgressDto;
}

// Per-status totals for the filter chips (ALL = sum). Always present so the
// UI never guesses counts from a partial, paginated list.
export type IssueStatusCounts = Record<IssueStatusDto, number> & { ALL: number };

// One page of issues plus the cursor for the next page (null = last page).
export interface IssueListPageDto {
  items: IssueListItemDto[];
  nextCursor: string | null;
  counts: IssueStatusCounts;
}

// Full shape for the detail view.
export interface IssueDetailDto extends IssueListItemDto {
  description: string | null;
  reporter: IssueAssigneeDto | null;
  epicId: string | null;
  // Hierarchy (ADR-0026): the parent epic (for a child) and the child issues
  // (for an epic). `epic` is null when the issue has no parent; `children` is
  // empty for non-epics (and populated only on the detail GET).
  epic: EpicSummaryDto | null;
  children: IssueChildDto[];
  // Subtasks (ADR-0045). `parent` is set only on a subtask; `subtasks` is
  // populated only for a type that may parent one, and both come back on the
  // detail GET so the page needs no second round-trip.
  parentId: string | null;
  parent: IssueParentDto | null;
  subtasks: SubtaskDto[];
  subtaskProgress: SubtaskProgressDto;
  /** This type may parent a subtask — drives whether the panel is offered. */
  canHaveSubtasks: boolean;
  dueDate: string | null;
  createdAt: string;
  // The viewer's permissions on this issue, resolved server-side so the UI
  // never guesses.
  canEdit: boolean;
  canDelete: boolean;
  // Legal next statuses from the current one (fixed workflow).
  allowedStatuses: IssueStatusDto[];
}
