import Link from "next/link";
import { Activity, ArrowRight, Clock, FolderOpen, Info, Users } from "lucide-react";
import { StatTile } from "@/shared/components/ui/stat-tile";
import { hours } from "@/features/workload/components/status-meta";
import type { WorkloadTotalsDto } from "@/features/workload/types/workload.types";

// The four headline figures.
//
// No trend deltas and no sparklines, though the mockup has both. They need a
// historical series EAGLES does not record, and two of these four cannot be
// reconstructed honestly even from the audit log: remaining effort and the
// overloaded count depend on estimates *as they were then*, and
// `estimateMinutes` is not versioned, so any "last month" figure would quietly
// be computed with today's estimates. An invented baseline on a capacity
// dashboard is worse than no baseline. Tracked as backlog UI-4.
export function WorkloadSummary({ totals }: { totals: WorkloadTotalsDto }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatTile label="People" value={totals.people} icon={<Users />} tone="accent" />
      <StatTile label="Open issues" value={totals.openIssues} icon={<FolderOpen />} tone="accent" />
      <StatTile
        label="Work remaining"
        value={hours(totals.remainingMinutes)}
        icon={<Clock />}
        tone="success"
      />
      <StatTile
        label="Overloaded"
        value={totals.overloaded}
        icon={<Activity />}
        // Neutral at zero: a permanently red tile is a red tile nobody reads.
        tone={totals.overloaded > 0 ? "danger" : "neutral"}
      />
    </div>
  );
}

/**
 * The single most important caveat on the page.
 *
 * Unestimated work counts as zero effort (BR-4), so a team can look
 * comfortable purely because nobody has estimated anything. Every figure below
 * this line is a floor, not a measurement, and the banner is where the page
 * says so.
 *
 * The mockup's "View unestimated issues" link now exists (UI-6, closed by
 * ADR-0040). It shipped without one for two passes because there was nowhere
 * honest to send it: issues were listed per project and no list could express
 * "has no estimate". /issues is cross-project and `hasEstimate=false` is a real
 * filter, so the link goes somewhere true rather than somewhere adjacent.
 *
 * `openOnly=true` rides along because this sentence counts OPEN issues. Without
 * it the link showed finished work too, and the destination quietly disagreed
 * with the number that sent you there.
 */
export function EstimateCoverageBanner({ totals }: { totals: WorkloadTotalsDto }) {
  if (totals.unestimated === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-accent/20 bg-accent/[0.06] px-4 py-3">
      <Info className="mt-px h-4 w-4 shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-foreground">
        <span className="font-medium">
          {totals.unestimated} of these {totals.openIssues} open issues have no estimate
        </span>
        , so the figures below understate the real load.
      </p>
      <Link
        href="/issues?hasEstimate=false&openOnly=true"
        className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        View unestimated
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
