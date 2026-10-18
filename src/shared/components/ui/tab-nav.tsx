"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";

export interface TabItem {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

/**
 * TabNav — Apple/Linear-Style Segmented Pill Navigation Bar
 * Replaces the old flat bottom-border underline strip with a tactile,
 * floating pill track where the active destination lifts into a crisp card pill.
 */
export function TabNav({ items, className }: { items: TabItem[]; className?: string }) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border/60 bg-surface-sunken/80 p-1.5 shadow-2xs",
        className
      )}
    >
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
              active
                ? "bg-surface text-foreground font-semibold shadow-xs ring-1 ring-border/50"
                : "text-muted-foreground hover:bg-surface/50 hover:text-foreground"
            )}
          >
            {item.icon && (
              <item.icon
                className={cn(
                  "h-4 w-4 transition-colors",
                  active ? "text-primary" : "text-muted-foreground"
                )}
                strokeWidth={active ? 2.2 : 1.8}
              />
            )}
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
