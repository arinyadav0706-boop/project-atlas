import { ListChecks } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { IssueTypeIcon } from "@/features/issues/components/issue-meta";
import { PriorityPill, StatusPill } from "@/features/home/components/issue-pills";
import { cn } from "@/shared/lib/utils";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";
import { PanelTabs } from "@/features/home/components/panel-tabs";
import type { Actor } from "@/shared/types/actor";
import type { HomeWorkTab } from "@/features/home/types/home.types";

const TABS: { tab: HomeWorkTab; label: string }[] = [
  { tab: "assigned", label: "Assigned to me" },
  { tab: "reported", label: "Reported by me" },
  { tab: "mentioned", label: "Mentioned" },
];

// Rows shown. The service returns one more than this panel needs, and five
// rows end level with the four attention items beside it.
const SHOWN = 5;

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
  const { items: all, truncated } = await HomeService.workTab(actor, projectIds, tab);
  const items = all.slice(0, SHOWN);
  return (
    <HomeSection
      title="My work"
      // A bare "10+": the tabs and the link share this header, and the noun is
      // in the title already.
      count={items.length}
      countTruncated={truncated || all.length > items.length}
      tabs={
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
        <MyWorkTable items={items} showAssignee={tab !== "assigned"} />
      ) : (
        <HomeEmpty icon={<ListChecks />} title={EMPTY[tab].title}>
          {EMPTY[tab].body}
        </HomeEmpty>
      )}
    </HomeSection>
  );
}

// Column tracks shared by the header and every row, so the columns line up.
const COLUMNS = "grid-cols-[minmax(0,1fr)_96px_84px_80px_52px]";
const COLUMNS_WITH_ASSIGNEE = "grid-cols-[minmax(0,1fr)_96px_84px_80px_52px_22px]";

/**
 * My work as a table, as in the approved reference: Issue · Project · Status ·
 * Priority · Due. Not `DataTable` — five rows in a half-width panel, no sorting, no paging.
 * No row checkboxes: Home has no bulk action, and a checkbox that selects
 * nothing is decoration.
 */
function MyWorkTable({ items, showAssignee }: { items: IssueListItemDto[]; showAssignee: boolean }) {
  const columns = showAssignee ? COLUMNS_WITH_ASSIGNEE : COLUMNS;
  return (
    <div role="table" aria-label="My work" className="-mx-2">
      <div
        role="row"
        className={cn(
          "grid h-8 items-center gap-3 border-b border-border bg-background px-4 text-[11px] font-medium text-muted-foreground",
          columns,
        )}
      >
        <span role="columnheader">Issue</span>
        <span role="columnheader">Project</span>
        <span role="columnheader">Status</span>
        <span role="columnheader">Priority</span>
        <span role="columnheader" className="text-right">
          Due
        </span>
        {showAssignee && <span role="columnheader" className="sr-only">Assignee</span>}
      </div>
      {items.map((item) => (
        <Link
          key={item.id}
          role="row"
          href={`/projects/${item.projectId}/issues/${item.id}`}
          className={cn(
            "grid h-[38px] items-center gap-3 border-b border-border-subtle px-4 transition-colors last:border-b-0 hover:bg-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus",
            columns,
          )}
        >
          <span role="cell" className="flex min-w-0 items-center gap-2">
            <IssueTypeIcon type={item.type} className="size-3.5 shrink-0" />
            <span className="shrink-0 text-[11px] font-medium text-accent">{item.key}</span>
            <span className="min-w-0 truncate text-[12px] text-foreground">{item.title}</span>
          </span>
          <span role="cell" className="truncate text-[11px] text-muted-foreground" title={item.projectName}>
            {item.projectName ?? "—"}
          </span>
          <span role="cell" className="flex items-center">
            <StatusPill status={item.status} />
          </span>
          <span role="cell" className="flex items-center">
            <PriorityPill priority={item.priority} />
          </span>
          <span
            role="cell"
            className={cn(
              "text-right text-[11px] tabular-nums whitespace-nowrap",
              // Overdue is decided by the service against one request clock.
              item.dueOverdue ? "font-medium text-rose-700" : "text-foreground/80",
            )}
          >
            {item.dueDate ? formatDue(item.dueDate) : "—"}
          </span>
          {showAssignee && (
            <span role="cell">
              {item.assignee ? (
                <Avatar className="size-[22px]" title={item.assignee.name}>
                  {item.assignee.avatarUrl && <AvatarImage src={item.assignee.avatarUrl} alt="" />}
                  <AvatarFallback className="text-micro">
                    {item.assignee.name.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <span className="sr-only">Unassigned</span>
              )}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}

// A due date is a day: label it in UTC, the calendar the rest of the app uses.
function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}
