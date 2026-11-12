"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Briefcase,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileWarning,
  FolderKanban,
  History,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  SquareCheckBig,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/shared/components/layout/app-frame";
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
import { ApproversAndDeadline, GLASS, HrHint, OUTLINE, PageTitle, PRIMARY, StatusChips, SummaryStrip } from "@/features/timesheets/components/timesheet-parts";
import { TimesheetApiError, timesheetApi } from "@/features/timesheets/api/timesheet-api";
import { periodLabel } from "@/features/timesheets/lib/format";
import { cn } from "@/shared/lib/utils";
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
  const panelOpen = problems !== null;

  return (
    <AppFrame>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-col gap-5 px-8 pb-6 pt-6">
            <PageTitle title="My Timesheet" trail="My Timesheet" />

            {/* Week controls and status */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-9 items-stretch overflow-hidden rounded-lg border border-line bg-background">
                <button type="button" aria-label="Previous week" onClick={() => go(addDays(p, -1))} className={SEG}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" aria-label="Next week" onClick={() => go(addDays(week.periodEnd, 1))} className={cn(SEG, "border-l border-line")}>
                  <ChevronRight className="h-4 w-4" />
                </button>
                <label className="relative flex cursor-pointer items-center gap-3 border-l border-line pl-4 pr-3 text-meta font-semibold text-foreground transition-colors hover:bg-muted/50 focus-within:ring-2 focus-within:ring-inset focus-within:ring-primary">
                  {periodLabel(p, week.periodEnd)}
                  <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                  <input
                    type="date"
                    aria-label="Pick a week"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    value={p}
                    onChange={(e) => e.target.value && go(e.target.value)}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={isCurrent}
                onClick={() => router.push("/timesheets")}
                className="h-9 rounded-lg border border-line bg-background px-3.5 text-meta font-semibold text-primary-ink transition-colors hover:bg-primary/[0.06] disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-background"
              >
                This Week
              </button>
              <div className="ml-auto">
                <StatusChips week={week} />
              </div>
            </div>

            <ApproversAndDeadline week={week} />
            <HrHint week={week} />

            {returnedOnly && (
              <div role="alert" className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/[0.08] px-4 py-3 text-meta text-foreground">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-ink" aria-hidden />
                <div className="space-y-0.5">
                  <p className="font-semibold">Returned for changes</p>
                  {week.returnComment && <p>“{week.returnComment}”</p>}
                  <p className="text-muted-foreground">Only the highlighted lines can be changed. Resubmit when they’re fixed.</p>
                </div>
              </div>
            )}

            {week.unlockedBy && !week.locked && week.status !== "SUBMITTED" && (
              <div className="rounded-lg border border-line bg-muted/40 px-4 py-3 text-meta text-foreground">
                Unlocked by <span className="font-semibold">{week.unlockedBy.name}</span> — “{week.unlockedBy.reason}”. Changes send it back for approval.
              </div>
            )}

            <SummaryStrip week={week} />

            <div className="overflow-x-auto rounded-xl border border-line bg-background">
              {week.rows.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/[0.08]">
                    <CalendarPlus className="h-5 w-5 text-primary-ink" aria-hidden />
                  </div>
                  <p className="mt-4 text-section font-semibold text-foreground">Nothing logged this week yet</p>
                  <p className="mx-auto mt-1 max-w-sm text-meta text-muted-foreground">
                    Add the issues and activities you worked on, or start from last week’s rows.
                  </p>
                  {editable && (
                    <div className="mt-5 flex justify-center gap-2">
                      <button type="button" className={PRIMARY} onClick={() => setAddKind("ISSUE")}>
                        <Plus className="h-4 w-4" /> Add issue
                      </button>
                      <button type="button" className={OUTLINE} onClick={() => setAddKind("ACTIVITY")}>
                        <Plus className="h-4 w-4" /> Add activity
                      </button>
                      <button type="button" className={OUTLINE} onClick={() => void run(() => timesheetApi.copyPrevious(p))}>
                        <Copy className="h-4 w-4" /> Copy last week
                      </button>
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
          </div>

          {/* Footer (§5.4), pinned to the bottom of the scroll area */}
          <div className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-2.5 border-t border-line bg-background/90 px-8 py-4 backdrop-blur-md">
            {/* Hidden on an empty week, whose own call-to-action already offers them. */}
            {editable && !returnedOnly && week.rows.length > 0 && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={OUTLINE}>
                      <Plus className="h-4 w-4" /> Add row <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" sideOffset={8} className={cn("w-48 rounded-xl p-1.5", GLASS)}>
                    <DropdownMenuItem className={MENU_ITEM} onSelect={() => setAddKind("ISSUE")}>
                      <SquareCheckBig className="h-4 w-4" /> Issue
                    </DropdownMenuItem>
                    <DropdownMenuItem className={MENU_ITEM} onSelect={() => setAddKind("ACTIVITY")}>
                      <Briefcase className="h-4 w-4" /> Activity
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button type="button" className={OUTLINE} onClick={() => void run(() => timesheetApi.copyPrevious(p), "Copied last week’s rows")}>
                  <Copy className="h-4 w-4" /> Copy last week
                </button>
              </>
            )}
            <button type="button" className={OUTLINE} onClick={() => setRecurringOpen(true)}>
              <Repeat className="h-4 w-4" /> Manage recurring
            </button>
            {week.id && week.status !== "DRAFT" && (
              <button type="button" className={OUTLINE} onClick={() => setHistoryFor(week.id)}>
                <History className="h-4 w-4" /> View approval history
              </button>
            )}

            <div className="ml-auto flex items-center gap-4">
              <SaveStatus state={save} />
              {panelOpen ? null : week.permissions.canSubmit ? (
                <button type="button" className={PRIMARY} disabled={submitting} onClick={() => void submit()}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {week.status === "RETURNED" ? "Resubmit" : "Submit Timesheet"}
                </button>
              ) : (
                <button type="button" className={OUTLINE} disabled title={week.locked ? "This week is locked — an admin can unlock it" : "Waiting for approval"}>
                  <Pencil className="h-4 w-4" /> Edit timesheet
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Submit blocked (§5.5) — a floating layer, so it gets the glass */}
        {panelOpen && (
          <aside aria-label="Can't submit timesheet" className={cn("m-3 flex w-[340px] shrink-0 flex-col rounded-xl", GLASS)}>
            <div className="flex items-start gap-3 px-5 pb-3 pt-5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger-ink" aria-hidden />
              <div className="flex-1">
                <h2 className="text-body font-semibold text-foreground">Can’t submit timesheet</h2>
                <p className="mt-0.5 text-micro text-muted-foreground">Please resolve the following before submitting.</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setProblems(null)} className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="flex-1 space-y-3 overflow-y-auto px-5 pb-4">
              {/* The server's current list, so a fixed problem disappears at
                  once; the panel never shows a stale item beside "all fixed". */}
              {week.problems.map((problem, i) => {
                const Icon = PROBLEM_ICON[problem.code];
                return (
                  <li key={`${problem.code}-${problem.rowId}-${problem.date}-${i}`} className="flex gap-3 rounded-xl border border-line bg-background p-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-destructive/[0.08]">
                      <Icon className="h-4 w-4 text-danger-ink" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="text-meta font-semibold text-foreground">{PROBLEM_TITLE[problem.code]}</p>
                      <p className="mt-0.5 text-micro text-muted-foreground">{problem.message}</p>
                      {problem.rowId && (
                        <button type="button" onClick={() => goToProblem(problem)} className="mt-2 text-meta font-semibold text-primary-ink hover:underline">
                          {problem.date ? "Go to cell" : "Go to row"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
              {week.problems.length === 0 && (
                <li className="flex items-center gap-3 rounded-xl border border-success/40 bg-success/[0.06] p-4 text-meta text-foreground">
                  <Check className="h-4 w-4 shrink-0 text-success-ink" aria-hidden /> All fixed — you can submit now.
                </li>
              )}
            </ul>
            <div className="px-5 pb-5">
              <button
                type="button"
                className={cn(PRIMARY, "w-full")}
                disabled={week.problems.length > 0 || submitting}
                onClick={() => void submit()}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {week.problems.length > 0 ? "Fix issues to submit" : week.status === "RETURNED" ? "Resubmit" : "Submit Timesheet"}
              </button>
            </div>
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

const SEG = "flex w-9 items-center justify-center text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary";
const MENU_ITEM = "h-9 gap-2.5 rounded-lg px-2.5 text-meta font-medium text-foreground data-[highlighted]:bg-primary/[0.08] data-[highlighted]:text-primary-ink";

const PROBLEM_ICON: Record<TimesheetProblemDto["code"], typeof AlertCircle> = {
  NOTE_REQUIRED: FileWarning,
  PROJECT_REQUIRED: FolderKanban,
  CLIENT_REQUIRED: Users,
  DAY_OVER_24H: Clock3,
  EMPTY_WEEK: CalendarPlus,
};

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
        Autosaved just now <Check className="h-4 w-4 text-success-ink" aria-hidden />
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
