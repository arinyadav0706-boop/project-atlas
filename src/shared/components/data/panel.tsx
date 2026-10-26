import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";

// The panel: a titled block of content on a page made of blocks.
//
// `Card` is the surface — a border, a radius, a shadow. This is the surface
// PLUS the grammar every dashboard-shaped page repeats: an icon, a title, a
// count, a link out, and a body. Home has five of them, Dashboards will have a
// grid of them, and the issue detail page is a column of them. Writing that
// header three times is how the three end up with three different title sizes.
//
// Deliberately not a variant of `Card`: a card can hold anything, a panel
// always has a header. Making the header optional would put the decision back
// at every call site, which is the thing being removed.

export function Panel({
  title,
  icon,
  count,
  /** Singular noun, pluralised automatically: "open issue" → "2 open issues". */
  countLabel,
  /** Renders the count as "10+" — the list is capped and there are more. */
  countTruncated = false,
  tabs,
  action,
  link,
  children,
  className,
  bodyClassName,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  count?: number;
  countLabel?: string;
  countTruncated?: boolean;
  /** Sits right after the title, as in the reference: views of this panel. */
  tabs?: React.ReactNode;
  /** Arbitrary right-hand control. `link` is the common case. */
  action?: React.ReactNode;
  link?: { href: string; label?: string };
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      aria-label={typeof title === "string" ? title : undefined}
      className={cn(
        // Flat: the reference separates cards from the canvas by tone and a
        // hairline, not by lift.
        "flex min-w-0 flex-col rounded-panel border border-border bg-background",
        className,
      )}
    >
      {/* No rule under the header: the reference separates rows, not the
          title from its own content. 44px, the reference's header height. */}
      <header className="flex min-h-[44px] shrink-0 flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2">
        {icon && (
          <span className="shrink-0 text-muted-foreground [&>svg]:size-4">{icon}</span>
        )}
        <h2 className="min-w-0 truncate text-[16px] font-semibold leading-6 tracking-[-0.01em] text-foreground">
          {title}
        </h2>

        {count !== undefined && count > 0 && (
          <span className="shrink-0 rounded-full bg-accent/10 px-2 text-micro font-semibold leading-5 tabular-nums text-accent">
            {/* "10+" and not "10". The list is capped at ten; someone with
                forty open issues was being shown "10 open issues" as a fact.
                A number that is quietly a floor is worse than no number. */}
            {count}
            {countTruncated && "+"}
            {countLabel && ` ${countLabel}${count === 1 && !countTruncated ? "" : "s"}`}
          </span>
        )}

        {tabs && <div className="ml-2 min-w-0">{tabs}</div>}

        {(action || link) && (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {action}
            {link && (
              <Link
                href={link.href}
                className="inline-flex items-center gap-1 rounded-chip text-label text-accent transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                {link.label ?? "View all"}
                <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        )}
      </header>

      <div className={cn("min-w-0 flex-1 px-2 pb-2", bodyClassName)}>{children}</div>
    </section>
  );
}
