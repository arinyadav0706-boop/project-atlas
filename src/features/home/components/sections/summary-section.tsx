import { Ban, CalendarClock, CircleCheck, CircleDot, Loader } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { StatTile } from "@/shared/components/ui/stat-tile";
import type { Actor } from "@/shared/types/actor";

// The Summary row (BR-10). Tone carries meaning only when the number does:
// something due or blocked is worth colouring, zero of either is not.
export async function SummarySection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const s = await HomeService.summary(actor, projectIds);
  return (
    <section aria-label="Summary" className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-5">
      <StatTile layout="leading" label="My open issues" value={s.open} icon={<CircleDot />} tone="accent" />
      <StatTile
        layout="leading"
        label="Due this week"
        value={s.dueThisWeek}
        icon={<CalendarClock />}
        tone={s.dueThisWeek > 0 ? "warning" : "neutral"}
        hint="incl. overdue"
      />
      <StatTile
        layout="leading"
        label="In progress"
        value={s.inProgress}
        icon={<Loader />}
        tone="accent"
        hint={s.inReview > 0 ? `+${s.inReview} in review` : undefined}
      />
      <StatTile
        layout="leading"
        label="Blocked"
        value={s.blocked}
        icon={<Ban />}
        tone={s.blocked > 0 ? "danger" : "neutral"}
        hint="by an open issue"
      />
      <StatTile
        layout="leading"
        label="Completed"
        value={s.completedLast30Days}
        icon={<CircleCheck />}
        tone="success"
        hint="last 30 days"
      />
    </section>
  );
}
