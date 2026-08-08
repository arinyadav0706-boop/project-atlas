import { Clock } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import { HomeIssueList } from "@/features/home/components/home-issue-row";
import type { Actor } from "@/shared/types/actor";

// "Continue working" — engagement-ranked recent issues (BR-3). Hidden when empty
// (a fresh user has no history yet).
export async function ContinueWorkingSection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const items = await HomeService.continueWorking(actor, projectIds);
  return (
    <HomeSection title="Continue working" icon={<Clock />}>
      {items.length > 0 ? (
        <HomeIssueList items={items} />
      ) : (
        <HomeEmpty icon={<Clock />} title="No recent items">
          Issues and projects you recently worked on will appear here.
        </HomeEmpty>
      )}
    </HomeSection>
  );
}
