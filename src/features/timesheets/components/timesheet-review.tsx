"use client";

import { useState } from "react";
import { CheckCircle2, CornerUpLeft, History, LockOpen } from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/shared/components/layout/app-frame";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { Textarea } from "@/shared/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/components/ui/dialog";
import { TimesheetGrid } from "@/features/timesheets/components/timesheet-grid";
import { ApprovalHistoryDialog } from "@/features/timesheets/components/timesheet-dialogs";
import { ApproversAndDeadline, GLASS, OUTLINE, PageTitle, PRIMARY, StatusChips, SummaryStrip } from "@/features/timesheets/components/timesheet-parts";
import { timesheetApi } from "@/features/timesheets/api/timesheet-api";
import { periodLabel } from "@/features/timesheets/lib/format";
import type { TimesheetWeekDto } from "@/features/timesheets/types/timesheet.types";

// Someone else's week, opened from a TIMESHEET_* notification. Read-only;
// an approver whose turn it is can approve or return lines (BR-26, BR-30a),
// and an org admin can unlock a locked week (BR-34). The full approvals
// inbox is TS-9.

export function TimesheetReview({ initialWeek, ownerName }: { initialWeek: TimesheetWeekDto; ownerName: string }) {
  const [week, setWeek] = useState(initialWeek);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [returnOpen, setReturnOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [unlockReason, setUnlockReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function act(action: () => Promise<TimesheetWeekDto>, done: string) {
    setBusy(true);
    try {
      setWeek(await action());
      toast.success(done);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  const chosenRows = week.rows.filter((r) => r.id && selected.has(r.id));
  const reasonsComplete = chosenRows.every((r) => (reasons[r.id!] ?? "").trim().length > 0);

  return (
    <AppFrame>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-5 px-8 pb-6 pt-6">
          <PageTitle title={`${ownerName}’s timesheet`} trail="Review" />
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-9 items-center rounded-lg border border-line bg-background px-4 text-meta font-semibold text-foreground">
              {periodLabel(week.periodStart, week.periodEnd)}
            </span>
            <div className="ml-auto">
              <StatusChips week={week} />
            </div>
          </div>
          <ApproversAndDeadline week={week} />
          <SummaryStrip week={week} />
          {week.permissions.canDecide && (
            <p className="text-meta text-muted-foreground">Tick the lines that need changes to return them, or approve the week.</p>
          )}
          <div className="overflow-x-auto rounded-xl border border-line bg-background">
            <TimesheetGrid
              rows={week.rows}
              days={week.days}
              canEdit={false}
              canOverrideBillable={false}
              highlightRowId={null}
              selectable={week.permissions.canDecide}
              selected={selected}
              onToggleSelected={(id) =>
                setSelected((s) => {
                  const next = new Set(s);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
          </div>
        </div>
        <div className="sticky bottom-0 mt-auto flex flex-wrap items-center gap-2.5 border-t border-line bg-background/90 px-8 py-4 backdrop-blur-md">
          {week.id && (
            <button type="button" className={OUTLINE} onClick={() => setHistoryOpen(true)}>
              <History className="h-4 w-4" /> View approval history
            </button>
          )}
          <div className="ml-auto flex items-center gap-2.5">
            {week.permissions.canUnlock && (
              <button type="button" className={OUTLINE} onClick={() => setUnlockOpen(true)}>
                <LockOpen className="h-4 w-4" /> Unlock week
              </button>
            )}
            {week.permissions.canDecide && (
              <>
                <button type="button" className={OUTLINE} disabled={selected.size === 0} onClick={() => setReturnOpen(true)}>
                  <CornerUpLeft className="h-4 w-4" /> Return {selected.size > 0 ? `${selected.size} line${selected.size === 1 ? "" : "s"}` : "lines"}
                </button>
                <button type="button" className={PRIMARY} disabled={busy} onClick={() => void act(() => timesheetApi.approve(week.id!), "Approved")}>
                  <CheckCircle2 className="h-4 w-4" /> Approve
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <Dialog open={returnOpen} onOpenChange={setReturnOpen}>
        <DialogContent className={cn("max-w-lg rounded-2xl p-6", GLASS)}>
          <DialogTitle>Return lines</DialogTitle>
          <DialogDescription>Say what needs to change on each line. {ownerName} can edit only these.</DialogDescription>
          <div className="mt-4 max-h-80 space-y-3 overflow-y-auto">
            {chosenRows.map((r) => (
              <div key={r.id}>
                <label htmlFor={`reason-${r.id}`} className="block text-label text-foreground">
                  {r.issue ? `${r.issue.key} ${r.issue.title}` : r.activity?.name}
                </label>
                <Textarea
                  id={`reason-${r.id}`}
                  className="mt-1 min-h-14 text-meta"
                  maxLength={500}
                  value={reasons[r.id!] ?? ""}
                  onChange={(e) => setReasons((x) => ({ ...x, [r.id!]: e.target.value }))}
                />
              </div>
            ))}
            <div>
              <label htmlFor="return-comment" className="block text-label text-foreground">
                Overall comment (optional)
              </label>
              <Textarea id="return-comment" className="mt-1 min-h-14 text-meta" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReturnOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!reasonsComplete}
              onClick={async () => {
                const ok = await act(
                  () =>
                    timesheetApi.returnLines(
                      week.id!,
                      chosenRows.map((r) => ({ rowId: r.id!, reason: reasons[r.id!]!.trim() })),
                      comment.trim() || undefined,
                    ),
                  "Returned for changes",
                );
                if (ok) {
                  setReturnOpen(false);
                  setSelected(new Set());
                }
              }}
            >
              Return
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent className={cn("rounded-2xl p-6", GLASS)}>
          <DialogTitle>Unlock this week?</DialogTitle>
          <DialogDescription>
            {ownerName} will be told, with your reason. If they change anything, the week goes back for approval.
          </DialogDescription>
          <label htmlFor="unlock-reason" className="mt-4 block text-label text-foreground">
            Reason (required)
          </label>
          <Textarea id="unlock-reason" className="mt-1 min-h-16 text-meta" maxLength={500} value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setUnlockOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!unlockReason.trim()}
              onClick={async () => {
                if (await act(() => timesheetApi.unlock(week.id!, unlockReason.trim()), "Week unlocked")) setUnlockOpen(false);
              }}
            >
              Unlock
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ApprovalHistoryDialog key={historyOpen ? "open" : "closed"} timesheetId={historyOpen ? week.id : null} onOpenChange={setHistoryOpen} />
    </AppFrame>
  );
}
