"use client";

import { CalendarClock, CheckCircle2, CircleDashed, CornerUpLeft, Info, Lock, Users } from "lucide-react";
import { deadlineLabel, dateTimeLabel, minutesLabel, percent } from "@/features/timesheets/lib/format";
import { cn } from "@/shared/lib/utils";
import { useIsClient } from "@/features/timesheets/hooks/use-is-client";
import type { TimesheetWeekDto } from "@/features/timesheets/types/timesheet.types";

// Header facts shared by the owner's screen and the approver's view
// (37_timesheets §5.1, §5.2). Status is always a word, never colour alone.

const STATUS: Record<TimesheetWeekDto["status"], { text: string; className: string; dot: string }> = {
  DRAFT: { text: "Draft", className: "border-warning/40 bg-warning/10 text-foreground", dot: "bg-warning" },
  SUBMITTED: { text: "Submitted", className: "border-primary/30 bg-primary/10 text-foreground", dot: "bg-primary" },
  RETURNED: { text: "Returned", className: "border-destructive/30 bg-destructive/10 text-foreground", dot: "bg-destructive" },
  APPROVED: { text: "Approved", className: "border-success/40 bg-success/10 text-foreground", dot: "bg-success" },
};

export function StatusChips({ week }: { week: TimesheetWeekDto }) {
  const s = STATUS[week.status];
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-label", s.className)}>
        <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
        {s.text}
        {week.autoApproved ? " automatically" : ""}
      </span>
      {week.locked && (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-label text-foreground">
          <Lock className="h-3 w-3" aria-hidden /> Locked
        </span>
      )}
      {week.submittedLate && week.status !== "DRAFT" && (
        <span className="rounded-full border border-border px-2.5 py-0.5 text-label text-muted-foreground">Submitted late</span>
      )}
    </div>
  );
}

const DECISION_ICON = {
  APPROVED: <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden />,
  RETURNED: <CornerUpLeft className="h-3.5 w-3.5 text-warning" aria-hidden />,
  PENDING: <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />,
  SKIPPED: <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />,
} as const;
const DECISION_TEXT = { APPROVED: "Approved", RETURNED: "Returned", PENDING: "Waiting", SKIPPED: "Not needed" } as const;

export function ApproversAndDeadline({ week }: { week: TimesheetWeekDto }) {
  const isClient = useIsClient();
  const deadline = isClient ? deadlineLabel(week.dueAt) : null;
  const showDeadline = week.status === "DRAFT" || week.status === "RETURNED";
  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-2">
      <div className="flex min-w-0 items-start gap-2">
        <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <div className="text-micro text-muted-foreground">Approvers</div>
          {week.approvals.length === 0 ? (
            <div className="text-meta text-foreground">
              {week.autoApproved ? "No other approver was available" : "Chosen when you submit"}
            </div>
          ) : (
            <ul className="flex flex-wrap gap-x-4 gap-y-0.5">
              {week.approvals.map((a, i) => (
                <li key={`${a.approver.id}-${i}`} className="flex items-center gap-1 text-meta text-foreground">
                  {DECISION_ICON[a.status]}
                  <span className="font-medium">{a.approver.name}</span>
                  <span className="text-muted-foreground">
                    {DECISION_TEXT[a.status]}
                    {a.decidedAt && isClient ? ` · ${dateTimeLabel(a.decidedAt)}` : ""}
                    {a.project ? ` · ${a.project.name}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {showDeadline && (
        <div className="flex items-start gap-2">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <div className="text-micro text-muted-foreground">Deadline</div>
            <div className="min-h-4 text-meta text-foreground">
              {deadline && (
                <>
                  {deadline.when}{" "}
                  <span className={deadline.overdue ? "font-medium text-destructive" : "text-muted-foreground"}>
                    ({deadline.relative})
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function HrHint({ week }: { week: TimesheetWeekDto }) {
  if (week.hrConnected) return null;
  const days = week.days.filter((d) => d.kind !== "WEEKEND").length;
  return (
    <div role="note" className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-meta text-foreground">
      <Info className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      <span className="flex-1">
        Leave &amp; holidays aren&apos;t synced from HR (HROne). Expected hours are calculated for a full working week
        ({days} days).
      </span>
      {/* The HR integration screen comes later (TS-7); the link says where it will live. */}
      <span className="shrink-0 text-meta font-medium text-muted-foreground" title="Coming with the HR integration">
        Integrate HR — coming soon
      </span>
    </div>
  );
}

export function SummaryStrip({ week }: { week: TimesheetWeekDto }) {
  const { loggedMinutes, expectedMinutes, billableMinutes, nonBillableMinutes } = week.totals;
  const ratio = expectedMinutes > 0 ? loggedMinutes / expectedMinutes : 0;
  const over = ratio > 1;
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-meta">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">Logged:</span>
        <span className="text-section text-foreground tabular-nums">{minutesLabel(loggedMinutes)}</span>
        <span className="text-muted-foreground">/ {minutesLabel(expectedMinutes)} expected</span>
        <div
          className="h-2 w-40 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Logged against expected"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round(ratio * 100))}
        >
          <div className={cn("h-full rounded-full", over ? "bg-destructive" : "bg-primary")} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
        <span className={cn("tabular-nums", over ? "font-medium text-destructive" : "text-foreground")}>
          {percent(loggedMinutes, expectedMinutes)}
          {over ? " — over" : ""}
        </span>
      </div>
      <div>
        <span className="text-muted-foreground">Billable: </span>
        <span className="font-medium text-foreground tabular-nums">{minutesLabel(billableMinutes)}</span>
      </div>
      <div>
        <span className="text-muted-foreground">Non-billable: </span>
        <span className="font-medium text-foreground tabular-nums">{minutesLabel(nonBillableMinutes)}</span>
      </div>
    </div>
  );
}
