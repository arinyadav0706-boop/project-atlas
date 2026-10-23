import Link from "next/link";
import { AtSign, CircleCheck, GitPullRequest, Inbox, RefreshCw, UserPlus } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { AttentionItemDto, AttentionKind } from "@/features/home/types/home.types";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import type { Actor } from "@/shared/types/actor";

// The unified attention inbox (ADR-0012). Renders items from ALL registered
// AttentionSources uniformly; hidden when empty to keep Home calm.
export async function AttentionSection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const { items, truncated } = await HomeService.attention(actor, projectIds);

  // Renders even when empty. In the paired two-column grid an absent card
  // leaves a hole and shifts every card below it out of its pair — and "you
  // are caught up" is information, not the absence of it.
  if (items.length === 0) {
    return (
      <HomeSection title="Needs your attention">
        <HomeEmpty icon={<Inbox />} title="You're all caught up!">
          We&apos;ll show mentions, reviews and updates that need your attention here.
        </HomeEmpty>
      </HomeSection>
    );
  }

  return (
    <HomeSection
      title="Needs your attention"
      count={items.length}
      countTruncated={truncated}
      // Home shows the top four. The attention source today is "my issues that
      // changed", so the full answer is my open work, most recently updated
      // first — the same question, on the page that holds all of it (BR-9).
      viewAll={{
        href: `/issues?assigneeId=${actor.userId}&openOnly=true&sort=UPDATED_DESC`,
        label: "View all",
      }}
    >
      <ul className="-mx-2 flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="border-t border-border-subtle first:border-t-0">
            <AttentionRow item={item} />
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}

// Each kind gets its own glyph and tint, as in the reference — severity reads
// before the words do. The sentence says why the item is here.
const KIND: Record<AttentionKind, { icon: typeof Inbox; tone: string; why: string }> = {
  ASSIGNED: { icon: UserPlus, tone: "bg-blue-50 text-blue-700", why: "Assigned to you" },
  UPDATED: { icon: RefreshCw, tone: "bg-amber-50 text-amber-700", why: "Changed since you last looked" },
  MENTION: { icon: AtSign, tone: "bg-violet-50 text-violet-700", why: "You were mentioned" },
  REVIEW_REQUEST: { icon: GitPullRequest, tone: "bg-blue-50 text-blue-700", why: "Your review was requested" },
  APPROVAL: { icon: CircleCheck, tone: "bg-emerald-50 text-emerald-700", why: "Waiting for your approval" },
};

function AttentionRow({ item }: { item: AttentionItemDto }) {
  const kind = KIND[item.kind];
  // Sources title issue items "KEY · Title"; the key is drawn as a link-blue
  // label like everywhere else on Home.
  const at = item.title.indexOf(" · ");
  const key = at > 0 ? item.title.slice(0, at) : null;
  const title = at > 0 ? item.title.slice(at + 3) : item.title;
  return (
    <Link
      href={item.href}
      className="flex items-start gap-3 px-4 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
    >
      <span
        aria-hidden
        className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", kind.tone)}
      >
        <kind.icon className="size-3.5" strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          {key && <span className="shrink-0 text-[12px] font-medium text-accent">{key}</span>}
          <span className="min-w-0 truncate text-[13px] font-semibold text-foreground">{title}</span>
        </span>
        <span className="block text-[12px] text-muted-foreground">{kind.why}</span>
      </span>
    </Link>
  );
}
