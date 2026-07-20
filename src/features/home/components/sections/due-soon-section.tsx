import { HomeService } from "@/features/home/services/home.service";
import { HomeSection } from "@/features/home/components/home-section";
import { HomeIssueList } from "@/features/home/components/home-issue-row";
import type { Actor } from "@/shared/types/actor";

// "Due soon" — my time-sensitive items (within the window, plus overdue).
// Hidden when nothing is due.
export async function DueSoonSection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const items = await HomeService.dueSoon(actor, projectIds);
  if (items.length === 0) return null;
  return (
    <HomeSection title="Due soon" count={items.length}>
      <HomeIssueList items={items} />
    </HomeSection>
  );
}
