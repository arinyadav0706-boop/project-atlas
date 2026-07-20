import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Presentational wrapper shared by every Home section — one calm, consistent
// header + optional "view all" link. Keeps the page visually uniform (Design
// Principles: restraint). Server-safe.
export function HomeSection({
  title,
  count,
  viewAll,
  children,
}: {
  title: string;
  count?: number;
  viewAll?: { href: string; label?: string };
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {title}
          {count !== undefined && count > 0 && (
            <span className="text-xs font-normal tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </h2>
        {viewAll && (
          <Link
            href={viewAll.href}
            className="inline-flex items-center gap-1 text-xs text-accent transition-opacity hover:opacity-80"
          >
            {viewAll.label ?? "View all"}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function HomeEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border bg-surface/50 px-4 py-6 text-center text-[13px] text-muted-foreground">
      {children}
    </p>
  );
}
