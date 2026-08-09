import { CalendarDays } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import { DueSoonList } from "@/features/home/components/due-soon-row";
import type { Actor } from "@/shared/types/actor";

// "Due soon" — my time-sensitive items (within the window, plus overdue).
// Hidden when nothing is due.
export async function DueSoonSection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const items = await HomeService.dueSoon(actor, projectIds);
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
      viewAll={{ href: "/projects", label: "View all" }}
    >
      <DueSoonList items={items} />
    </HomeSection>
  );
}
