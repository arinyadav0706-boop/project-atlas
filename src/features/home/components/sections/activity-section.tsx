import Link from "next/link";
import { Activity } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import { PanelTabs } from "@/features/home/components/panel-tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import type { Actor } from "@/shared/types/actor";
import type { ActivityItemDto, HomeActivityTab } from "@/features/home/types/home.types";

const TABS: { tab: HomeActivityTab; label: string }[] = [
  { tab: "all", label: "All" },
  { tab: "comments", label: "Comments" },
  { tab: "status", label: "Status changes" },
  { tab: "assignments", label: "Assignments" },
];

// Recent activity (BR-14): what other people did to my work in the last two
// weeks. Every row is a recorded event — a comment, an audited status change or
// reassignment — never something inferred from an issue's current state.
export async function ActivitySection({
  actor,
  projectIds,
  tab,
  hrefFor,
}: {
  actor: Actor;
  projectIds: string[];
  tab: HomeActivityTab;
  hrefFor: (tab: HomeActivityTab) => string;
}) {
  const { items } = await HomeService.activity(actor, projectIds, tab);
  return (
    <HomeSection
      title="Recent activity"
      icon={<Activity />}
      action={
        <PanelTabs
          label="Activity views"
          tabs={TABS.map((t) => ({
            href: hrefFor(t.tab),
            label: t.label,
            active: t.tab === tab,
          }))}
        />
      }
    >
      {items.length > 0 ? (
        <ul className="flex flex-col">
          {items.map((item) => (
            <li key={item.id}>
              <ActivityRow item={item} />
            </li>
          ))}
        </ul>
      ) : (
        <HomeEmpty icon={<Activity />} title="Nothing new">
          Comments, status changes and reassignments on your issues from the last two
          weeks will appear here.
        </HomeEmpty>
      )}
    </HomeSection>
  );
}

function ActivityRow({ item }: { item: ActivityItemDto }) {
  const who = item.actor?.name ?? (item.kind === "COMMENT" ? "An automation" : "Someone");
  return (
    <Link
      href={item.href}
      className="flex gap-2.5 rounded-control px-2 py-1.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      <Avatar className="mt-0.5 size-6 shrink-0">
        {item.actor?.avatarUrl && <AvatarImage src={item.actor.avatarUrl} alt="" />}
        <AvatarFallback className="text-micro">
          {who.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block text-body text-foreground">
          <span className="font-medium">{who}</span>{" "}
          <span className="text-muted-foreground">
            <Sentence item={item} />
          </span>
        </span>
        {item.kind === "COMMENT" && item.excerpt && (
          <span className="mt-0.5 line-clamp-2 block text-meta text-muted-foreground">
            {item.excerpt}
          </span>
        )}
      </span>
      <span className="shrink-0 whitespace-nowrap text-meta tabular-nums text-muted-foreground">
        {item.occurredAgo}
      </span>
    </Link>
  );
}

function Key({ item }: { item: ActivityItemDto }) {
  return <span className="font-mono text-meta text-accent">{item.issue.key}</span>;
}

function Sentence({ item }: { item: ActivityItemDto }) {
  switch (item.kind) {
    case "COMMENT":
      return (
        <>
          commented on <Key item={item} />
        </>
      );
    case "STATUS":
      return (
        <>
          moved <Key item={item} /> to{" "}
          <span className="text-foreground">{item.status}</span>
        </>
      );
    case "ASSIGNMENT":
      if (item.toMe) {
        return (
          <>
            assigned <Key item={item} /> to <span className="text-foreground">you</span>
          </>
        );
      }
      return item.assignee ? (
        <>
          assigned <Key item={item} /> to{" "}
          <span className="text-foreground">{item.assignee.name}</span>
        </>
      ) : (
        <>
          unassigned <Key item={item} />
        </>
      );
  }
}
