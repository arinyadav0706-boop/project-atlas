import Link from "next/link";
import { Bell } from "lucide-react";
import { Inbox } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection, HomeEmpty } from "@/features/home/components/home-section";
import type { Actor } from "@/shared/types/actor";

// The unified attention inbox (ADR-0012). Renders items from ALL registered
// AttentionSources uniformly; hidden when empty to keep Home calm.
export async function AttentionSection({ actor, projectIds }: { actor: Actor; projectIds: string[] }) {
  const items = await HomeService.attention(actor, projectIds);

  // Renders even when empty. In the paired two-column grid an absent card
  // leaves a hole and shifts every card below it out of its pair — and "you
  // are caught up" is information, not the absence of it.
  if (items.length === 0) {
    return (
      <HomeSection title="Needs your attention" icon={<Inbox />}>
        <HomeEmpty icon={<Inbox />} title="You're all caught up!">
          We&apos;ll show mentions, reviews and updates that need your attention here.
        </HomeEmpty>
      </HomeSection>
    );
  }

  return (
    <HomeSection title="Needs your attention" icon={<Inbox />} count={items.length}>
      <div className="overflow-hidden rounded-xl border border-border">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-3 border-b border-border bg-background px-4 py-2.5 last:border-b-0 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            <Bell className="h-4 w-4 shrink-0 text-amber-500" strokeWidth={1.8} />
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">
              {item.title}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              changed
            </span>
          </Link>
        ))}
      </div>
    </HomeSection>
  );
}
