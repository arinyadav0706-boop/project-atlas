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
      <div className="flex flex-col gap-1.5">
        {items.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 transition-all duration-150 hover:border-accent/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {/* Token, not `text-amber-500` — an ad-hoc palette colour here is
                exactly what the no-hex rule exists to stop. */}
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-warning/10">
              <Bell className="h-3.5 w-3.5 text-warning" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">
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
