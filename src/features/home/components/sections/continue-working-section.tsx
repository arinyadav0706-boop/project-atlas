import { Clock } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import { ExpandableSection } from "@/features/home/components/expandable-section";
import { FOCUS_LIST_CLASS, FocusRow } from "@/features/home/components/focus-list";
import type { Actor } from "@/shared/types/actor";

// "Continue working" — engagement-ranked recent issues (BR-3). Lives in the right
// rail, so it uses the rail's two-line row rather than the wide table row. Four
// show; the rest open in place, since recency has no list page to link to.
export async function ContinueWorkingSection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const items = await HomeService.continueWorking(actor, projectIds);
  if (items.length === 0) {
    return (
      <HomeSection title="Continue working">
        <HomeEmpty icon={<Clock />} title="No recent items">
          Issues and projects you recently worked on will appear here.
        </HomeEmpty>
      </HomeSection>
    );
  }
  return (
    <ExpandableSection
      title="Continue working"
      initial={4}
      listClassName={FOCUS_LIST_CLASS}
      rows={items.map((item) => (
        <FocusRow key={item.id} item={item} />
      ))}
    />
  );
}
