import { ListChecks } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import { HomeIssueList } from "@/features/home/components/home-issue-row";
import { PanelTabs } from "@/features/home/components/panel-tabs";
import type { Actor } from "@/shared/types/actor";
import type { HomeWorkTab } from "@/features/home/types/home.types";

const TABS: { tab: HomeWorkTab; label: string }[] = [
  { tab: "assigned", label: "Assigned to me" },
  { tab: "reported", label: "Reported by me" },
  { tab: "mentioned", label: "Mentioned" },
];

const EMPTY: Record<HomeWorkTab, { title: string; body: string }> = {
  assigned: {
    title: "Nothing assigned to you",
    body: "Work assigned to you will show up here.",
  },
  reported: {
    title: "Nothing open that you reported",
    body: "Open issues you created will show up here.",
  },
  mentioned: {
    title: "No open mentions",
    body: "Open issues where someone @mentions you will show up here.",
  },
};

// Async server component — suspends on its own fetch so it streams independently
// (Performance doc). Always rendered (empty state doubles as light onboarding).
export async function MyWorkSection({
  actor,
  projectIds,
  tab,
  hrefFor,
}: {
  actor: Actor;
  projectIds: string[];
  tab: HomeWorkTab;
  /** The Home URL with this panel's tab switched, every other tab kept. */
  hrefFor: (tab: HomeWorkTab) => string;
}) {
  const { items, truncated } = await HomeService.workTab(actor, projectIds, tab);
  return (
    <HomeSection
      title="My work"
      icon={<ListChecks />}
      count={items.length}
      countLabel="open issue"
      countTruncated={truncated}
      action={
        <PanelTabs
          label="My work views"
          tabs={TABS.map((t) => ({
            href: hrefFor(t.tab),
            label: t.label,
            active: t.tab === tab,
          }))}
        />
      }
      // Only "Assigned to me" has a list page that answers the same question.
      // IssueFilter has no reporter or mention facet, and a link that lands on a
      // different question is a dead end dressed as a shortcut (BR-9, BR-13).
      viewAll={
        tab === "assigned"
          ? {
              href: `/issues?assigneeId=${actor.userId}&openOnly=true`,
              label: "View all",
            }
          : undefined
      }
    >
      {items.length > 0 ? (
        <HomeIssueList items={items} />
      ) : (
        <HomeEmpty icon={<ListChecks />} title={EMPTY[tab].title}>
          {EMPTY[tab].body}
        </HomeEmpty>
      )}
    </HomeSection>
  );
}
