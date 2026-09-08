import { CalendarDays } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import { DueSoonList } from "@/features/home/components/due-soon-row";
import type { Actor } from "@/shared/types/actor";

// "Due soon" — my time-sensitive items (within the window, plus overdue).
// Hidden when nothing is due.
export async function DueSoonSection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const { items, truncated } = await HomeService.dueSoon(actor, projectIds);
  if (items.length === 0) {
    return (
      <HomeSection title="Due soon" icon={<CalendarDays />}>
        <HomeEmpty icon={<CalendarDays />} title="Nothing due soon">
          Issues with a due date in the next two weeks will appear here.
        </HomeEmpty>
      </HomeSection>
    );
  }
  return (
    <HomeSection
      title="Due soon"
      icon={<CalendarDays />}
      count={items.length}
      countTruncated={truncated}
      // There is no due-date facet in IssueFilter, so this cannot reproduce the
      // window exactly. Sorting the reader's open work by due date is the
      // closest honest answer, and it is the list they were reaching for.
      viewAll={{
        href: `/issues?assigneeId=${actor.userId}&openOnly=true&sort=DUE_DATE_ASC`,
        label: "View all",
      }}
    >
      <DueSoonList items={items} />
    </HomeSection>
  );
}
