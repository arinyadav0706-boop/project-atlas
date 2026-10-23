import { Target } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import { FocusList } from "@/features/home/components/focus-list";
import type { Actor } from "@/shared/types/actor";

// "Your focus" (BR-11) — what is due, then my most urgent open work. It absorbs
// the old Due soon panel. No goal ring and no meetings: neither has a data
// source yet, and Home does not show what it cannot back (BR-12).
export async function FocusSection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const { items } = await HomeService.focus(actor, projectIds);
  if (items.length === 0) {
    return (
      <HomeSection title="Your focus">
        <HomeEmpty icon={<Target />} title="Nothing open">
          Issues assigned to you will appear here, the ones due soonest first.
        </HomeEmpty>
      </HomeSection>
    );
  }
  return (
    <HomeSection
      title="Your focus"
      // There is no due-date facet in IssueFilter, so this cannot reproduce the
      // window exactly. Sorting the reader's open work by due date is the
      // closest honest answer, and it is the list they were reaching for.
      viewAll={{
        href: `/issues?assigneeId=${actor.userId}&openOnly=true&sort=DUE_DATE_ASC`,
        label: "View all",
      }}
    >
      <FocusList items={items} />
    </HomeSection>
  );
}
