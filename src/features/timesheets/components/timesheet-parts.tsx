"use client";

import { ArrowRight, CalendarDays, CheckCircle2, CircleDashed, CornerUpLeft, Info, Lock, UserRound } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { deadlineLabel, dateTimeLabel, minutesLabel, percent } from "@/features/timesheets/lib/format";
import { cn } from "@/shared/lib/utils";
import { useIsClient } from "@/features/timesheets/hooks/use-is-client";
import type { TimesheetWeekDto } from "@/features/timesheets/types/timesheet.types";

// Header facts shared by the owner's screen and the approver's view
// (37_timesheets §5.1, §5.2), drawn to the approved mockup. Status is always
// a word, never colour alone.

// Floating layers only get glass (§5.6): menus, popovers, dialogs, panels.
export const GLASS = "border border-line bg-glass/85 shadow-[0_8px_30px_-12px_hsl(222_47%_11%/0.25)] backdrop-blur-xl";

const PILL = "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-label";

// Control styles shared by the owner's screen and the approver's view. The
// shared Button carries a shadow and a tighter radius than this screen's
// mockup (borders, not shadows; 8px controls), so the timesheet uses these.
export const OUTLINE =
  "inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-background px-3.5 text-meta font-medium text-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-background";
export const PRIMARY =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary-ink px-5 text-meta font-semibold text-white transition-colors hover:bg-primary-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground";

export function PageTitle({ title, trail }: { title: string; trail: string }) {
  return (
    <div>
      <nav aria-label="Breadcrumb" className="text-meta text-muted-foreground">
        Timesheets <span aria-hidden className="mx-1.5">/</span>
        <span className="font-medium text-foreground">{trail}</span>
      </nav>
      <h1 className="mt-1.5 text-[22px] font-semibold leading-7 tracking-[-0.015em] text-foreground">{title}</h1>
    </div>
  );
}

export function StatusChips({ week }: { week: TimesheetWeekDto }) {
  const pill = {
    DRAFT: (
      <span className={cn(PILL, "bg-warning/[0.12] text-warning-ink")}>
        <span aria-hidden className="h-2.5 w-2.5 rounded-full border-[2.5px] border-warning-ink" />
        Draft
      </span>
    ),
    SUBMITTED: (
      <span className={cn(PILL, "bg-primary/10 text-primary-ink")}>
        <CircleDashed className="h-3.5 w-3.5" aria-hidden />
        Submitted
      </span>
    ),
    RETURNED: (
      <span className={cn(PILL, "bg-destructive/10 text-danger-ink")}>
        <CornerUpLeft className="h-3.5 w-3.5" aria-hidden />
        Returned
      </span>
    ),
    APPROVED: (
      <span className={cn(PILL, "bg-success/[0.12] text-success-ink")}>
        <span aria-hidden className="h-2.5 w-2.5 rounded-full border-[2.5px] border-success-ink" />
        {week.autoApproved ? "Approved automatically" : "Approved"}
      </span>
    ),
  }[week.status];
  return (
    <div className="flex items-center gap-2">
      {pill}
      {week.locked && (
        <span className={cn(PILL, "bg-muted text-foreground")}>
          <Lock className="h-3.5 w-3.5" aria-hidden /> Locked
        </span>
      )}
      {week.submittedLate && week.status !== "DRAFT" && (
        <span className={cn(PILL, "border border-line text-muted-foreground")}>Submitted late</span>
      )}
    </div>
  );
}

const DECISION = {
  APPROVED: { icon: <CheckCircle2 className="h-4 w-4 fill-success text-white" aria-hidden />, text: "Approved", tone: "text-success-ink" },
  RETURNED: { icon: <CornerUpLeft className="h-4 w-4 text-warning-ink" aria-hidden />, text: "Returned", tone: "text-warning-ink" },
  PENDING: { icon: <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />, text: "Waiting", tone: "text-muted-foreground" },
  SKIPPED: { icon: <CircleDashed className="h-4 w-4 text-muted-foreground" aria-hidden />, text: "Not needed", tone: "text-muted-foreground" },
} as const;

// The info bar under the week controls: approvers (with each decision once
// there is one) and, while the week is still open, the deadline.
export function ApproversAndDeadline({ week }: { week: TimesheetWeekDto }) {
  const isClient = useIsClient();
  const deadline = isClient ? deadlineLabel(week.dueAt) : null;
  const decided = week.approvals.some((a) => a.status !== "PENDING");
  const showDeadline = week.status === "DRAFT" || week.status === "RETURNED";

  return (
    <div className="flex flex-wrap items-stretch border-y border-line">
      <div className="flex min-w-0 flex-1 items-center gap-3 py-3 pr-6">
        <UserRound className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
        {decided ? (
          <div className="flex min-w-0 flex-wrap items-center gap-x-8 gap-y-1.5">
            <span className="text-meta text-muted-foreground">Approvals</span>
            {week.approvals.map((a, i) => {
              const d = DECISION[a.status];
              return (
                <span key={`${a.approver.id}-${i}`} className="flex items-center gap-2 text-meta">
                  {d.icon}
                  <span className="font-semibold text-foreground">{a.approver.name}</span>
                  <span className={d.tone}>
                    {d.text}
                    {a.decidedAt && isClient ? ` · ${dateTimeLabel(a.decidedAt)}` : ""}
                    {a.project ? ` · ${a.project.name}` : ""}
                  </span>
                </span>
              );
            })}
          </div>
        ) : (
          <div className="min-w-0">
            <div className="text-micro text-muted-foreground">Approvers</div>
            <div className="truncate text-meta font-medium text-foreground">
              {week.approvals.length > 0
                ? week.approvals.map((a) => a.approver.name).join(", ")
                : week.autoApproved
                  ? "No other approver was available"
                  : "Chosen when you submit"}
            </div>
          </div>
        )}
      </div>
      {showDeadline && (
        <div className="flex items-center gap-3 border-l border-line py-3 pl-6 pr-2">
          <CalendarDays className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
          <div>
            <div className="text-micro text-muted-foreground">Deadline</div>
            <div className="min-h-4 text-meta font-medium text-foreground">
              {deadline && (
                <>
                  {deadline.when}{" "}
                  <span className={deadline.overdue ? "text-danger-ink" : "text-warning-ink"}>({deadline.relative})</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// BR-14: the basis and the caveat are part of the number.
export function HrHint({ week }: { week: TimesheetWeekDto }) {
  if (week.hrConnected) return null;
  const days = week.days.filter((d) => d.kind !== "WEEKEND").length;
  return (
    <div role="note" className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/[0.06] px-4 py-2.5 text-meta text-foreground">
      <Info className="h-4 w-4 shrink-0 text-primary-ink" aria-hidden />
      <span className="flex-1">
        Leave &amp; holidays aren&apos;t synced from HR (HROne). Expected hours are calculated for a full working week ({days}{" "}
        {days === 1 ? "day" : "days"}).
      </span>
      {/* The HR integration screen is later (TS-7). Rather than a link that
          goes nowhere, it says so. */}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold text-primary-ink hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            Integrate HR <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className={cn("w-72 rounded-xl p-4 text-meta", GLASS)}>
          <p className="font-semibold text-foreground">HROne integration is coming soon</p>
          <p className="mt-1 text-muted-foreground">
            Once connected, holidays and approved leave come off your expected hours automatically. Until then, expected
            hours assume a full working week.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function SummaryStrip({ week }: { week: TimesheetWeekDto }) {
  const { loggedMinutes, expectedMinutes, billableMinutes, nonBillableMinutes } = week.totals;
  const ratio = expectedMinutes > 0 ? loggedMinutes / expectedMinutes : 0;
  const over = ratio > 1;
  return (
    // One line at any width: the bar is the part that gives, so a divider
    // never ends up stranded at the start of a wrapped line.
    <div className="flex min-w-0 items-center whitespace-nowrap border-b border-line pb-4 text-meta">
      <div className="flex shrink-0 items-baseline gap-2.5 pr-6">
        <span className="text-muted-foreground">Logged:</span>
        <span className="text-section font-semibold tabular-nums text-foreground">{minutesLabel(loggedMinutes)}</span>
        <span className="font-medium text-foreground">/ {minutesLabel(expectedMinutes)} expected</span>
      </div>
      <div className="flex min-w-0 shrink items-center gap-3 pr-6">
        <div
          className="h-2 w-56 min-w-16 shrink overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="Logged against expected"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.round(ratio * 100))}
        >
          <div
            className={cn("h-full rounded-full transition-[width] duration-500 ease-out", over ? "bg-destructive" : "bg-primary")}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-label tabular-nums",
            over ? "bg-destructive/10 text-danger-ink" : "bg-muted text-foreground",
          )}
        >
          {percent(loggedMinutes, expectedMinutes)}
          {over && <span className="sr-only"> — over expected</span>}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-l border-line px-6">
        <span className="text-muted-foreground">Billable:</span>
        <span className="font-semibold tabular-nums text-foreground">{minutesLabel(billableMinutes)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 border-l border-line pl-6">
        <span className="text-muted-foreground">Non-billable:</span>
        <span className="font-semibold tabular-nums text-foreground">{minutesLabel(nonBillableMinutes)}</span>
      </div>
    </div>
  );
}
