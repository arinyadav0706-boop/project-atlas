import { HomeService } from "@/features/home/services/home.service";
import { HomeSection } from "@/features/home/components/home-section";
import { HomeIssueList } from "@/features/home/components/home-issue-row";
import type { Actor } from "@/shared/types/actor";

// "Continue working" — engagement-ranked recent issues (BR-3). Hidden when empty
// (a fresh user has no history yet).
export async function ContinueWorkingSection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const items = await HomeService.continueWorking(actor, projectIds);
  if (items.length === 0) return null;
  return (
    <HomeSection title="Continue working">
      <HomeIssueList items={items} />
    </HomeSection>
  );
}
