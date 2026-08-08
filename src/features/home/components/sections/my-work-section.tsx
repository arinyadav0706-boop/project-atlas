import { ListChecks } from "lucide-react";
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
    <HomeSection
      title="My work"
      icon={<ListChecks />}
      count={items.length}
      countLabel="open issue"
      viewAll={{ href: "/projects", label: "View all issues" }}
    >
      {items.length > 0 ? (
        <HomeIssueList items={items} />
      ) : (
        <HomeEmpty icon={<ListChecks />} title="Nothing assigned to you">
          Work assigned to you will show up here.
        </HomeEmpty>
      )}
    </HomeSection>
  );
}
