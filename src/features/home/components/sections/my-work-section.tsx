import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import { HomeIssueList } from "@/features/home/components/home-issue-row";
import type { Actor } from "@/shared/types/actor";

// Async server component — suspends on its own fetch so it streams independently
// (ADR-0012 / Performance doc). Always rendered (empty state doubles as light
// onboarding).
export async function MyWorkSection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const items = await HomeService.myWork(actor, projectIds);
  return (
    <HomeSection title="My work" count={items.length}>
      {items.length > 0 ? (
        <HomeIssueList items={items} />
      ) : (
        <HomeEmpty>Nothing assigned to you right now — enjoy the calm.</HomeEmpty>
      )}
    </HomeSection>
  );
}
