// Client calls for module 37 (docs/04_API/openapi.yaml, tag `timesheets`).
// Unlike the shared apiRequest, errors keep their status, code and problems,
// because the screen acts on them: a stale cell refreshes, a blocked submit
// lists what to fix (BR-24), a cell with several logs explains itself (BR-8).

import type {
  ActivityPickerDto,
  PinnedTimesheetRowDto,
  TimesheetApprovalDto,
  TimesheetCellSaveResultDto,
  TimesheetIssueOptionDto,
  TimesheetProblemDto,
  TimesheetRowDto,
  TimesheetWeekDto,
} from "@/features/timesheets/types/timesheet.types";

export class TimesheetApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string | null,
    public readonly problems: TimesheetProblemDto[],
  ) {
    super(message);
    this.name = "TimesheetApiError";
  }
}

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
      code?: string;
      problems?: TimesheetProblemDto[];
    } | null;
    throw new TimesheetApiError(
      payload?.message ?? "Something went wrong. Please try again.",
      response.status,
      payload?.code ?? null,
      payload?.problems ?? [],
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const week = (periodStart: string) => `/timesheets/me/weeks/${periodStart}`;

export const timesheetApi = {
  getWeek: (periodStart: string) => call<TimesheetWeekDto>(week(periodStart)),

  addRow: (periodStart: string, input: { issueId?: string; activityId?: string; projectId?: string | null }) =>
    call<TimesheetRowDto>(`${week(periodStart)}/rows`, "POST", input),

  saveCell: (
    periodStart: string,
    rowId: string,
    date: string,
    input: { duration: string; note?: string | null; expectedVersion?: number },
  ) =>
    call<TimesheetCellSaveResultDto>(
      `${week(periodStart)}/rows/${encodeURIComponent(rowId)}/cells/${date}`,
      "PUT",
      input,
    ),

  updateRow: (
    rowId: string,
    input: { projectId?: string | null; billableOverride?: boolean | null; expectedVersion: number },
  ) => call<TimesheetRowDto>(`/timesheets/rows/${rowId}`, "PATCH", input),

  removeRow: (rowId: string) => call<void>(`/timesheets/rows/${rowId}`, "DELETE"),
  duplicateRow: (rowId: string) => call<TimesheetRowDto>(`/timesheets/rows/${rowId}/duplicate`, "POST"),
  moveRow: (rowId: string, direction: "up" | "down") =>
    call<void>(`/timesheets/rows/${rowId}/move`, "POST", { direction }),
  pinRow: (rowId: string) => call<PinnedTimesheetRowDto>(`/timesheets/rows/${rowId}/pin`, "POST"),
  unpinRow: (rowId: string) => call<void>(`/timesheets/rows/${rowId}/pin`, "DELETE"),

  copyPrevious: (periodStart: string) => call<TimesheetWeekDto>(`${week(periodStart)}/copy-previous`, "POST"),
  submit: (periodStart: string, expectedVersion: number) =>
    call<TimesheetWeekDto>(`${week(periodStart)}/submit`, "POST", { expectedVersion }),

  listPinned: () => call<PinnedTimesheetRowDto[]>("/timesheets/me/pinned"),
  reorderPinned: (id: string, position: number) =>
    call<PinnedTimesheetRowDto>(`/timesheets/me/pinned/${id}`, "PATCH", { position }),
  removePinned: (id: string) => call<void>(`/timesheets/me/pinned/${id}`, "DELETE"),

  history: (timesheetId: string) => call<TimesheetApprovalDto[]>(`/timesheets/${timesheetId}/history`),
  approve: (timesheetId: string, comment?: string) =>
    call<TimesheetWeekDto>(`/timesheets/${timesheetId}/approve`, "POST", comment ? { comment } : {}),
  returnLines: (timesheetId: string, rows: { rowId: string; reason: string }[], comment?: string) =>
    call<TimesheetWeekDto>(`/timesheets/${timesheetId}/return`, "POST", { rows, ...(comment ? { comment } : {}) }),
  unlock: (timesheetId: string, reason: string) =>
    call<TimesheetWeekDto>(`/timesheets/${timesheetId}/unlock`, "POST", { reason }),

  issueOptions: (periodStart: string, q: string) =>
    call<{ suggested: TimesheetIssueOptionDto[]; results: TimesheetIssueOptionDto[] }>(
      `/timesheets/pickers/issues?periodStart=${periodStart}${q ? `&q=${encodeURIComponent(q)}` : ""}`,
    ),
  activityOptions: (q: string) =>
    call<ActivityPickerDto>(`/timesheets/pickers/activities${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  setFavourite: (activityId: string, on: boolean) =>
    call<void>(`/activities/${activityId}/favorite`, on ? "POST" : "DELETE"),
};
