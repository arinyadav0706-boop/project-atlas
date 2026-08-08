import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardHeader } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";

// Presentational wrapper shared by every Home section.
//
// Every section renders through this, so it is the single place the Home
// surface's look is defined — restyle here and all five move together, which
// is why the sections themselves stayed untouched in the visual pass.
export function HomeSection({
  title,
  icon,
  count,
  countLabel,
  viewAll,
  children,
  className,
}: {
  title: string;
  icon?: React.ReactNode;
  count?: number;
  /** Singular noun, pluralised automatically: "open issue" → "2 open issues". */
  countLabel?: string;
  viewAll?: { href: string; label?: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader
        icon={icon}
        title={title}
        action={
          <>
            {count !== undefined && count > 0 && countLabel && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium tabular-nums text-accent">
                {count} {countLabel}
                {count === 1 ? "" : "s"}
              </span>
            )}
            {viewAll && (
              <Link
                href={viewAll.href}
                className="inline-flex items-center gap-1 text-[13px] font-medium text-accent transition-opacity hover:opacity-80"
              >
                {viewAll.label ?? "View all"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </>
        }
      />
      <div className="px-2 pb-2">{children}</div>
    </Card>
  );
}

// The count pill sits in the header, so an empty section needs no number —
// it needs a sentence. Compact by default: these live inside cards that share
// a row, and a full-height empty state would stretch its neighbour.
export function HomeEmpty({
  children,
  icon,
  title,
}: {
  children?: React.ReactNode;
  icon?: React.ReactNode;
  title?: string;
}) {
  return (
    <EmptyState
      compact
      icon={icon}
      title={title ?? "Nothing here yet"}
      description={typeof children === "string" ? children : undefined}
    />
  );
}
