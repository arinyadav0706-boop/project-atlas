import { CalendarDays, CircleCheck, ClipboardList, RotateCw, TriangleAlert } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { StatTile } from "@/shared/components/ui/stat-tile";
import type { Actor } from "@/shared/types/actor";

// The Summary row (BR-10). Each figure has its reference hue, except that due
// and blocked only turn rose when there is something due or blocked: a red
// zero reads as an alarm about nothing.
export async function SummarySection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const s = await HomeService.summary(actor, projectIds);
  return (
    <section aria-label="Summary" className="mb-1 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
      <StatTile layout="leading" label="My open issues" value={s.open} icon={<ClipboardList />} tone="blue" />
      <StatTile
        layout="leading"
        label="Due this week"
        value={s.dueThisWeek}
        icon={<CalendarDays />}
        tone={s.dueThisWeek > 0 ? "rose" : "neutral"}
        hint="incl. overdue"
      />
      <StatTile
        layout="leading"
        label="In progress"
        value={s.inProgress}
        icon={<RotateCw />}
        tone="violet"
        hint={s.inReview > 0 ? `+${s.inReview} in review` : undefined}
      />
      <StatTile
        layout="leading"
        label="Blocked"
        value={s.blocked}
        icon={<TriangleAlert />}
        tone={s.blocked > 0 ? "rose" : "neutral"}
        hint="by an open issue"
      />
      <StatTile
        layout="leading"
        label="Completed"
        value={s.completedLast30Days}
        // A solid disc with a white tick, as in the reference: the white ring
        // is the icon's own outline, drawn in white over the fill.
        icon={<CircleCheck className="!size-7 fill-green-500 text-white" />}
        tone="green"
        hint="last 30 days"
      />
    </section>
  );
}
