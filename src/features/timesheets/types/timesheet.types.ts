// DTOs for module 37 — mirrors docs/04_API/openapi.yaml (tag `timesheets`).

import type { DayKind, ProblemCode } from "@/features/timesheets/lib/rules";
import type { Relation } from "@/features/timesheets/lib/approvers";

export type TimesheetStatusDto = "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED";
export type ApprovalStatusDto = "PENDING" | "APPROVED" | "RETURNED" | "SKIPPED";

export interface NamedRef {
  id: string;
  name: string;
}

export interface TimesheetCellDto {
  date: string;
  minutes: number;
  logCount: number;
  logId: string | null;
  version: number | null;
  note: string | null;
  noteRequired: boolean;
}

export interface TimesheetRowDto {
  id: string | null;
  position: number;
  kind: "ISSUE" | "ACTIVITY";
  issue: { id: string; key: string; title: string; projectName: string } | null;
  activity: {
    id: string;
    name: string;
    categoryName: string;
    requiresProject: boolean;
    requiresClient: boolean;
  } | null;
  project: NamedRef | null;
  client: NamedRef | null;
  billable: boolean;
  billableOverridden: boolean;
  pinned: boolean;
  returnedReason: string | null;
  editable: boolean;
  cells: TimesheetCellDto[];
  totalMinutes: number;
  version: number;
}

export interface TimesheetDayDto {
  date: string;
  kind: DayKind;
  label: string | null;
  expectedMinutes: number;
  totalMinutes: number;
  overtime: boolean;
  editable: boolean;
}

export interface TimesheetProblemDto {
  code: ProblemCode;
  message: string;
  rowId: string | null;
  date: string | null;
}

export interface TimesheetApprovalDto {
  round: number;
  relation: Relation;
  project: NamedRef | null;
  approver: { id: string; name: string; avatarUrl: string | null };
  status: ApprovalStatusDto;
  fallbackFrom: Relation | null;
  decidedAt: string | null;
  comment: string | null;
}

export interface TimesheetTotalsDto {
  loggedMinutes: number;
  expectedMinutes: number;
  billableMinutes: number;
  nonBillableMinutes: number;
}

export interface TimesheetWeekDto {
  id: string | null;
  periodStart: string;
  periodEnd: string;
  status: TimesheetStatusDto;
  locked: boolean;
  lockedAt: string | null;
  autoApproved: boolean;
  unlockedBy: { name: string; at: string; reason: string } | null;
  submittedAt: string | null;
  submittedLate: boolean;
  dueAt: string;
  version: number;
  hrConnected: boolean;
  workingWeek: string;
  days: TimesheetDayDto[];
  rows: TimesheetRowDto[];
  totals: TimesheetTotalsDto;
  approvals: TimesheetApprovalDto[];
  returnComment: string | null;
  problems: TimesheetProblemDto[];
  permissions: {
    canEdit: boolean;
    canSubmit: boolean;
    canOverrideBillable: boolean;
    canUnlock: boolean;
    // The viewer is an approver whose turn it is in the current round.
    canDecide: boolean;
  };
}

export interface TimesheetCellSaveResultDto {
  cell: TimesheetCellDto;
  rowTotalMinutes: number;
  day: TimesheetDayDto;
  totals: TimesheetTotalsDto;
  timesheetId: string;
  timesheetVersion: number;
}

export interface PinnedTimesheetRowDto {
  id: string;
  position: number;
  kind: "ISSUE" | "ACTIVITY";
  label: string;
  projectName: string | null;
  clientName: string | null;
}

export interface TimesheetIssueOptionDto {
  id: string;
  key: string;
  title: string;
  projectName: string;
  reason: "ASSIGNED" | "WORKED_THIS_PERIOD" | "SEARCH";
}

export interface ActivityOptionDto {
  id: string;
  name: string;
  categoryId: string;
  requiresProject: boolean;
  requiresClient: boolean;
  notesRequired: boolean;
  favourite: boolean;
}

export interface ActivityPickerDto {
  favourites: ActivityOptionDto[];
  recents: ActivityOptionDto[];
  categories: { id: string; name: string; activities: ActivityOptionDto[] }[];
}
