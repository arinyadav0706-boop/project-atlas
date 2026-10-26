import { Clock } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import { FocusList } from "@/features/home/components/focus-list";
import type { Actor } from "@/shared/types/actor";

// "Continue working" — engagement-ranked recent issues (BR-3). Lives in the right
// rail, so it uses the rail's two-line row rather than the wide table row. The
// panel has a fixed height; anything past what fits scrolls inside it.
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
    <HomeSection title="Continue working">
      <FocusList items={items} />
    </HomeSection>
  );
}
