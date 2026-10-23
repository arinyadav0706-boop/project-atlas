import { Gauge } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection } from "@/features/home/components/home-section";
import {
  loadFraction,
  LIGHT_WEEKS,
  OVERLOADED_WEEKS,
} from "@/features/workload/lib/capacity";
import { cn } from "@/shared/lib/utils";
import type { Actor } from "@/shared/types/actor";
import type { WorkloadStatus } from "@/features/workload/types/workload.types";

const STATUS: Record<WorkloadStatus, { label: string; bar: string; text: string }> = {
  IDLE: {
    label: "Nothing open",
    bar: "bg-muted-foreground",
    text: "text-muted-foreground",
  },
  LIGHT: { label: "Light", bar: "bg-accent", text: "text-accent" },
  BALANCED: { label: "Balanced", bar: "bg-success", text: "text-success" },
  OVERLOADED: { label: "Overloaded", bar: "bg-destructive", text: "text-destructive" },
};

// Workload (BR-17): my own queue, by the Workload module's definitions. No team
// comparison — only managers may see colleagues' load (Workload BR-8), and a
// team figure on everyone's Home would leak it.
export async function WorkloadSection({ actor }: { actor: Actor }) {
  const w = await HomeService.workload(actor);
  const status = STATUS[w.status];
  // The bar's full width is the overloaded line, as on the Workload page.
  const fill = loadFraction(w.weeksOfWork);
  return (
    <HomeSection
      title="Workload"
      icon={<Gauge />}
      viewAll={w.canViewTeam ? { href: "/workload", label: "Open Workload" } : undefined}
    >
      <div className="flex flex-col gap-3 px-1 pb-1">
        <div className="flex items-baseline gap-2">
          <span className="text-page-title font-semibold leading-none tabular-nums text-foreground">
            {w.weeksOfWork.toFixed(1)}
            {w.truncated && "+"}
          </span>
          <span className="text-meta text-muted-foreground">weeks of work queued</span>
          <span className={cn("ml-auto text-meta font-medium", status.text)}>
            {status.label}
          </span>
        </div>

        <div
          className="relative h-2 rounded-full bg-muted"
          role="img"
          aria-label={`${w.weeksOfWork.toFixed(1)} weeks, ${status.label}`}
        >
          <span
            className={cn("absolute inset-y-0 left-0 rounded-full", status.bar)}
            style={{ width: `${fill * 100}%` }}
          />
          {/* Below this line is "light"; the bar's right end is the overloaded line. */}
          <span
            className="absolute -inset-y-0.5 border-l border-dashed border-border-strong"
            style={{ left: `${(LIGHT_WEEKS / OVERLOADED_WEEKS) * 100}%` }}
            aria-hidden
          />
        </div>

        <dl className="grid grid-cols-2 gap-2 text-meta">
          <div>
            <dt className="text-muted-foreground">Open issues</dt>
            <dd className="text-body font-medium tabular-nums text-foreground">
              {w.openIssues}
              {w.truncated && "+"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Not estimated</dt>
            <dd className="text-body font-medium tabular-nums text-foreground">
              {w.unestimated}
            </dd>
          </div>
        </dl>

        <p className="text-meta text-muted-foreground">
          Remaining estimate ÷ capacity ({w.workingWeek.label}). Unestimated issues count
          as open but add no time.
        </p>
      </div>
    </HomeSection>
  );
}
