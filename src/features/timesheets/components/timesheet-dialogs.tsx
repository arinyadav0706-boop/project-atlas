"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, CircleDashed, CornerUpLeft, MinusCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { timesheetApi } from "@/features/timesheets/api/timesheet-api";
import { dateTimeLabel } from "@/features/timesheets/lib/format";
import type {
  PinnedTimesheetRowDto,
  TimesheetApprovalDto,
  TimesheetRowDto,
} from "@/features/timesheets/types/timesheet.types";

const SELECT = "h-9 w-full rounded-md border border-border bg-background px-2 text-meta text-foreground";

// Edit a row (BR-18): an activity's project tag, and the billable override
// when the organization allows it (BR-11). Changing which issue a row is for
// is "remove and add" — simpler to read in the audit trail than a swap.
export function EditRowDialog({
  row,
  projects,
  canOverrideBillable,
  onOpenChange,
  onSave,
}: {
  row: TimesheetRowDto | null;
  projects: { id: string; name: string }[];
  canOverrideBillable: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (row: TimesheetRowDto, input: { projectId?: string | null; billableOverride?: boolean | null }) => Promise<boolean>;
}) {
  // The parent remounts this per row (key), so initial state is the row's.
  const [projectId, setProjectId] = useState(row?.project?.id ?? "");
  const [billable, setBillable] = useState<"default" | "yes" | "no">(
    row?.billableOverridden ? (row.billable ? "yes" : "no") : "default",
  );
  const [busy, setBusy] = useState(false);

  if (!row) return null;
  const label = row.issue ? `${row.issue.key} ${row.issue.title}` : (row.activity?.name ?? "Activity");

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Edit line</DialogTitle>
        <DialogDescription>{label}</DialogDescription>
        <div className="mt-4 space-y-4">
          {row.kind === "ACTIVITY" && (
            <div>
              <label htmlFor="ts-edit-project" className="block text-label text-foreground">
                Project{row.activity?.requiresProject ? "" : " (optional)"}
              </label>
              <select id="ts-edit-project" className={`${SELECT} mt-1.5`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {canOverrideBillable && (
            <div>
              <label htmlFor="ts-edit-billable" className="block text-label text-foreground">
                Billable
              </label>
              <select
                id="ts-edit-billable"
                className={`${SELECT} mt-1.5`}
                value={billable}
                onChange={(e) => setBillable(e.target.value as "default" | "yes" | "no")}
              >
                <option value="default">Use the default</option>
                <option value="yes">Billable</option>
                <option value="no">Non-billable</option>
              </select>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={row.kind === "ACTIVITY" && Boolean(row.activity?.requiresProject) && !projectId}
            onClick={async () => {
              setBusy(true);
              const ok = await onSave(row, {
                ...(row.kind === "ACTIVITY" ? { projectId: projectId || null } : {}),
                ...(canOverrideBillable ? { billableOverride: billable === "default" ? null : billable === "yes" } : {}),
              });
              setBusy(false);
              if (ok) onOpenChange(false);
            }}
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// "Manage recurring" (BR-19): the rows that appear in every new week.
export function ManageRecurringDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  // Remounted on each open (key), so it starts empty and loads once.
  const [pins, setPins] = useState<PinnedTimesheetRowDto[] | null>(null);

  useEffect(() => {
    if (!open) return;
    timesheetApi.listPinned().then(setPins).catch((e: Error) => toast.error(e.message));
  }, [open]);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setPins(await timesheetApi.listPinned());
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Recurring rows</DialogTitle>
        <DialogDescription>
          These appear in every new week. Removing one keeps it in weeks that already have it.
        </DialogDescription>
        <div className="mt-4">
          {pins === null ? (
            <p className="py-6 text-center text-meta text-muted-foreground">Loading…</p>
          ) : pins.length === 0 ? (
            <p className="py-6 text-center text-meta text-muted-foreground">
              No recurring rows yet. Use “Pin as recurring” in a row’s menu.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {pins.map((p, index) => (
                <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-meta text-foreground">{p.label}</div>
                    <div className="truncate text-micro text-muted-foreground">
                      {p.kind === "ISSUE" ? "Issue" : "Activity"}
                      {p.projectName ? ` · ${p.projectName}` : ""}
                      {p.clientName ? ` · ${p.clientName}` : ""}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${p.label} up`} disabled={index === 0} onClick={() => void run(() => timesheetApi.reorderPinned(p.id, index - 1))}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move ${p.label} down`} disabled={index === pins.length - 1} onClick={() => void run(() => timesheetApi.reorderPinned(p.id, index + 1))}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Stop ${p.label} recurring`} onClick={() => void run(() => timesheetApi.removePinned(p.id))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_ICON = {
  APPROVED: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />,
  RETURNED: <CornerUpLeft className="h-4 w-4 text-warning" aria-hidden />,
  PENDING: <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />,
  SKIPPED: <MinusCircle className="h-4 w-4 text-muted-foreground" aria-hidden />,
} as const;

const STATUS_TEXT = { APPROVED: "Approved", RETURNED: "Returned", PENDING: "Waiting", SKIPPED: "Not needed" } as const;
const RELATION_TEXT = { REPORTING: "Reporting manager", FUNCTIONAL: "Functional manager", PROJECT: "Project lead" } as const;

// "View approval history" (BR-27): every round, oldest first.
export function ApprovalHistoryDialog({
  timesheetId,
  onOpenChange,
}: {
  timesheetId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  // Remounted per timesheet (key), so it starts empty and loads once.
  const [items, setItems] = useState<TimesheetApprovalDto[] | null>(null);

  useEffect(() => {
    if (!timesheetId) return;
    timesheetApi.history(timesheetId).then(setItems).catch((e: Error) => toast.error(e.message));
  }, [timesheetId]);

  const rounds = [...new Set((items ?? []).map((i) => i.round))];
  return (
    <Dialog open={timesheetId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Approval history</DialogTitle>
        <DialogDescription>Every submission and each approver’s decision.</DialogDescription>
        <div className="mt-4 max-h-96 space-y-4 overflow-y-auto scroll-fade">
          {items === null ? (
            <p className="py-6 text-center text-meta text-muted-foreground">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-meta text-muted-foreground">Not submitted yet.</p>
          ) : (
            rounds.map((round) => (
              <section key={round}>
                <h3 className="text-label text-foreground">Submission {round}</h3>
                <ul className="mt-1.5 space-y-2">
                  {items
                    .filter((i) => i.round === round)
                    .map((i, index) => (
                      <li key={`${round}-${index}`} className="flex items-start gap-2">
                        {STATUS_ICON[i.status]}
                        <div className="min-w-0 text-meta">
                          <div className="text-foreground">
                            <span className="font-medium">{i.approver.name}</span> · {STATUS_TEXT[i.status]}
                            {i.decidedAt ? ` · ${dateTimeLabel(i.decidedAt)}` : ""}
                          </div>
                          <div className="text-micro text-muted-foreground">
                            {RELATION_TEXT[i.relation]}
                            {i.project ? ` · ${i.project.name}` : ""}
                            {i.fallbackFrom ? " · standing in" : ""}
                          </div>
                          {i.comment && <p className="mt-0.5 text-micro text-foreground">“{i.comment}”</p>}
                        </div>
                      </li>
                    ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
