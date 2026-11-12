"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  History,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppFrame, WorkspaceHeader } from "@/shared/components/layout/app-frame";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { TimesheetGrid, rowDomId, type RowAction } from "@/features/timesheets/components/timesheet-grid";
import { cellDomId } from "@/features/timesheets/components/timesheet-cell";
import { AddRowDialog, type AddRowKind } from "@/features/timesheets/components/add-row-dialog";
import { ApprovalHistoryDialog, EditRowDialog, ManageRecurringDialog } from "@/features/timesheets/components/timesheet-dialogs";
import { ApproversAndDeadline, HrHint, StatusChips, SummaryStrip } from "@/features/timesheets/components/timesheet-parts";
import { TimesheetApiError, timesheetApi } from "@/features/timesheets/api/timesheet-api";
import { periodLabel } from "@/features/timesheets/lib/format";
import { addDays } from "@/features/timesheets/lib/period";
import type { TimesheetProblemDto, TimesheetRowDto, TimesheetWeekDto } from "@/features/timesheets/types/timesheet.types";

// Screen 1, "My Timesheet" (docs/02_Modules/37_timesheets.md §5). Every
// function is wired to the API; the visual match to the mockups is Step 4.

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; at: Date } | { kind: "error"; message: string };

export function MyTimesheet({
  initialWeek,
  currentPeriodStart,
  projects,
}: {
  initialWeek: TimesheetWeekDto;
  currentPeriodStart: string;
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [week, setWeek] = useState(initialWeek);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [problems, setProblems] = useState<TimesheetProblemDto[] | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [addKind, setAddKind] = useState<AddRowKind | null>(null);
  const [editRow, setEditRow] = useState<TimesheetRowDto | null>(null);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dateInput = useRef<HTMLInputElement>(null);

  const p = week.periodStart;

  const refresh = useCallback(async () => {
    try {
      setWeek(await timesheetApi.getWeek(p));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }, [p]);

  // Every write goes through here: one place to show "Saving…", surface the
  // server's message, and re-read the week so totals, flags and problems are
  // always the server's, never a client guess.
  const run = useCallback(
    async (action: () => Promise<unknown>, success?: string): Promise<boolean> => {
      setSave({ kind: "saving" });
      try {
        await action();
        await refresh();
        setSave({ kind: "saved", at: new Date() });
        if (success) toast.success(success);
        return true;
      } catch (e) {
        const message = (e as Error).message;
        setSave({ kind: "error", message });
        toast.error(message);
        // A conflict means our copy is stale: show the current state.
        if (e instanceof TimesheetApiError && e.status === 409) await refresh();
        return false;
      }
    },
    [refresh],
  );

  function go(date: string) {
    router.push(`/timesheets?date=${date}`);
  }

  async function onSaveCell(row: TimesheetRowDto, date: string, duration: string, note?: string | null) {
    const cell = row.cells.find((c) => c.date === date);
    return run(() =>
      timesheetApi.saveCell(p, row.id!, date, {
        duration,
        ...(note !== undefined ? { note } : {}),
        ...(cell?.version !== null && cell?.version !== undefined ? { expectedVersion: cell.version } : {}),
      }),
    );
  }

  function onRowAction(row: TimesheetRowDto, action: RowAction) {
    const id = row.id!;
    if (action === "edit") setEditRow(row);
    else if (action === "pin") void run(() => timesheetApi.pinRow(id), "Pinned — it will appear in every new week");
    else if (action === "unpin") void run(() => timesheetApi.unpinRow(id), "No longer recurring");
    else if (action === "duplicate") void run(() => timesheetApi.duplicateRow(id));
    else if (action === "up" || action === "down") void run(() => timesheetApi.moveRow(id, action));
    else if (action === "remove") {
      const hours = row.totalMinutes > 0 ? " and its hours" : "";
      if (window.confirm(`Remove this line${hours} from the week?`)) void run(() => timesheetApi.removeRow(id));
    }
  }

  async function submit() {
    setSubmitting(true);
    try {
      setWeek(await timesheetApi.submit(p, week.version));
      setProblems(null);
      toast.success("Submitted for approval");
    } catch (e) {
      if (e instanceof TimesheetApiError && e.problems.length > 0) setProblems(e.problems);
      else toast.error((e as Error).message);
      await refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function goToProblem(problem: TimesheetProblemDto) {
    if (problem.rowId && problem.date) {
      const el = document.getElementById(cellDomId(problem.rowId, problem.date));
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus();
    } else if (problem.rowId) {
      document.getElementById(rowDomId(problem.rowId))?.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlight(problem.rowId);
      setTimeout(() => setHighlight(null), 2500);
    }
  }

  const editable = week.permissions.canEdit;
  const returnedOnly = week.status === "RETURNED";
  const isCurrent = p === currentPeriodStart;
  const livePanelProblems = problems ?? null;

  return (
    <AppFrame>
      <WorkspaceHeader
        title="My Timesheet"
        breadcrumb={<span>Timesheets</span>}
        actions={<StatusChips week={week} />}
      />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
          {/* Week navigation (§5.1) */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => go(addDays(p, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => go(addDays(week.periodEnd, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <label className="relative inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-meta font-medium text-foreground">
              {periodLabel(p, week.periodEnd)}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              <input
                ref={dateInput}
                type="date"
                aria-label="Pick a week"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={p}
                onChange={(e) => e.target.value && go(e.target.value)}
              />
            </label>
            <Button variant="outline" size="sm" disabled={isCurrent} onClick={() => router.push("/timesheets")}>
              This Week
            </Button>
          </div>

          <ApproversAndDeadline week={week} />
          <HrHint week={week} />

          {returnedOnly && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-meta text-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
              <div>
                <p className="font-medium">Returned for changes</p>
                {week.returnComment && <p>“{week.returnComment}”</p>}
                <p className="text-muted-foreground">Only the highlighted lines can be changed. Submit again when they’re fixed.</p>
              </div>
            </div>
          )}

          {week.unlockedBy && !week.locked && week.status !== "SUBMITTED" && (
            <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-meta text-foreground">
              Unlocked by <span className="font-medium">{week.unlockedBy.name}</span> — “{week.unlockedBy.reason}”. Changes send it back for approval.
            </div>
          )}

          <SummaryStrip week={week} />

          <div className="min-h-0 overflow-x-auto rounded-lg border border-border">
            {week.rows.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-section text-foreground">Nothing logged this week yet</p>
                <p className="mt-1 text-meta text-muted-foreground">
                  Add an issue or an activity, or start from last week’s rows.
                </p>
                {editable && (
                  <div className="mt-4 flex justify-center gap-2">
                    <Button size="sm" onClick={() => setAddKind("ISSUE")}>
                      <Plus className="h-4 w-4" /> Add issue
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAddKind("ACTIVITY")}>
                      <Plus className="h-4 w-4" /> Add activity
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void run(() => timesheetApi.copyPrevious(p))}>
                      <Copy className="h-4 w-4" /> Copy last week
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <TimesheetGrid
                rows={week.rows}
                days={week.days}
                canEdit={editable}
                canOverrideBillable={week.permissions.canOverrideBillable}
                highlightRowId={highlight}
                onSaveCell={onSaveCell}
                onToggleBillable={(row) =>
                  void run(() => timesheetApi.updateRow(row.id!, { billableOverride: !row.billable, expectedVersion: row.version }))
                }
                onRowAction={onRowAction}
              />
            )}
          </div>

          {/* Footer (§5.4) */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {editable && !returnedOnly && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4" /> Add row <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem className="text-meta" onSelect={() => setAddKind("ISSUE")}>
                      Issue
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-meta" onSelect={() => setAddKind("ACTIVITY")}>
                      Activity
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={() => void run(() => timesheetApi.copyPrevious(p), "Copied last week’s rows")}>
                  <Copy className="h-4 w-4" /> Copy last week
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => setRecurringOpen(true)}>
              <Repeat className="h-4 w-4" /> Manage recurring
            </Button>
            {week.id && week.status !== "DRAFT" && (
              <Button variant="outline" size="sm" onClick={() => setHistoryFor(week.id)}>
                <History className="h-4 w-4" /> View approval history
              </Button>
            )}

            <div className="ml-auto flex items-center gap-3">
              <SaveStatus state={save} />
              {week.permissions.canSubmit ? (
                <Button
                  onClick={() => void submit()}
                  loading={submitting}
                  disabled={livePanelProblems !== null && livePanelProblems.length > 0 && week.problems.length > 0}
                >
                  {livePanelProblems && week.problems.length > 0 ? "Fix issues to submit" : week.status === "RETURNED" ? "Resubmit" : "Submit Timesheet"}
                </Button>
              ) : (
                <Button variant="outline" disabled title={week.locked ? "This week is locked — an admin can unlock it" : "Waiting for approval"}>
                  <Pencil className="h-4 w-4" /> Edit timesheet
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Submit blocked (§5.5) */}
        {livePanelProblems && livePanelProblems.length > 0 && (
          <aside aria-label="Can't submit timesheet" className="flex w-80 shrink-0 flex-col border-l border-border bg-background">
            <div className="flex items-start gap-2 border-b border-border px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden />
              <div className="flex-1">
                <h2 className="text-label text-foreground">Can’t submit timesheet</h2>
                <p className="text-micro text-muted-foreground">Resolve these first. The list updates as you fix them.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setProblems(null)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="flex-1 space-y-2 overflow-y-auto p-3">
              {/* The server's current list, so a fixed problem disappears at
                  once; the panel never shows a stale item beside "all fixed". */}
              {week.problems.map((problem, i) => (
                <li key={`${problem.code}-${problem.rowId}-${problem.date}-${i}`} className="rounded-md border border-border p-3">
                  <p className="text-meta font-medium text-foreground">{PROBLEM_TITLE[problem.code]}</p>
                  <p className="mt-0.5 text-micro text-muted-foreground">{problem.message}</p>
                  {problem.rowId && (
                    <button type="button" onClick={() => goToProblem(problem)} className="mt-1.5 text-micro font-medium text-primary hover:underline">
                      {problem.date ? "Go to cell" : "Go to row"}
                    </button>
                  )}
                </li>
              ))}
              {week.problems.length === 0 && (
                <li className="rounded-md border border-success/40 bg-success/5 p-3 text-meta text-foreground">
                  All fixed — you can submit now.
                </li>
              )}
            </ul>
          </aside>
        )}
      </div>

      <AddRowDialog
        key={`add-${addKind ?? "closed"}`}
        open={addKind !== null}
        kind={addKind ?? "ISSUE"}
        periodStart={p}
        projects={projects}
        onOpenChange={(open) => !open && setAddKind(null)}
        onAdd={(input) => run(() => timesheetApi.addRow(p, input))}
      />
      <EditRowDialog
        key={`edit-${editRow?.id ?? "none"}`}
        row={editRow}
        projects={projects}
        canOverrideBillable={week.permissions.canOverrideBillable}
        onOpenChange={(open) => !open && setEditRow(null)}
        onSave={(row, input) => run(() => timesheetApi.updateRow(row.id!, { ...input, expectedVersion: row.version }))}
      />
      <ManageRecurringDialog key={`recurring-${recurringOpen}`} open={recurringOpen} onOpenChange={setRecurringOpen} />
      <ApprovalHistoryDialog key={`history-${historyFor ?? "none"}`} timesheetId={historyFor} onOpenChange={(open) => !open && setHistoryFor(null)} />
    </AppFrame>
  );
}

const PROBLEM_TITLE: Record<TimesheetProblemDto["code"], string> = {
  NOTE_REQUIRED: "Missing required note",
  PROJECT_REQUIRED: "Project is required",
  CLIENT_REQUIRED: "Client is required",
  DAY_OVER_24H: "More than 24 hours in a day",
  EMPTY_WEEK: "Nothing logged",
};

function SaveStatus({ state }: { state: SaveState }) {
  if (state.kind === "saving") {
    return (
      <span className="flex items-center gap-1 text-micro text-muted-foreground" aria-live="polite">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Saving…
      </span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span className="flex items-center gap-1 text-micro text-muted-foreground" aria-live="polite">
        Autosaved just now <Check className="h-3.5 w-3.5 text-success" aria-hidden />
      </span>
    );
  }
  if (state.kind === "error") {
    return (
      <span className="flex items-center gap-1 text-micro text-destructive" aria-live="polite">
        <AlertCircle className="h-3.5 w-3.5" aria-hidden /> Couldn’t save
      </span>
    );
  }
  return null;
}
