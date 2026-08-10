import { Activity, Clock, FolderOpen, Info, Users } from "lucide-react";
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
 * The mockup ends this banner with a "View unestimated issues" link. There is
 * nowhere honest to send it — issues are listed per project, and no list
 * supports a "has no estimate" filter — so it ships without one rather than
 * with a link that goes somewhere unrelated. Backlog UI-6.
 */
export function EstimateCoverageBanner({ totals }: { totals: WorkloadTotalsDto }) {
  if (totals.unestimated === 0) return null;

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-accent/20 bg-accent/[0.06] px-4 py-3">
      <Info className="mt-px h-4 w-4 shrink-0 text-accent" aria-hidden />
      <p className="text-[13px] leading-relaxed text-foreground">
        <span className="font-medium">
          {totals.unestimated} of these {totals.openIssues} open issues have no estimate
        </span>
        , so the figures below understate the real load.
      </p>
    </div>
  );
}
