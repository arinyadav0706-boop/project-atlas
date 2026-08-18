"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";

// Section tabs, one implementation.
//
// There were two, and they did not match: the admin console drew its active
// state with `border-b-2` on the link itself, the project shell with an
// absolutely-positioned span inset from the label. Different underline widths,
// different weights, different vertical rhythm — on two navigations that sit in
// the same place on screen and do the same job.
//
// `exact` matters for parent routes: /admin/organization must not light up when
// the reader is on /admin/users, but /projects/x/issues should stay active on a
// child issue page.
export interface TabItem {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}

export function TabNav({ items, className }: { items: TabItem[]; className?: string }) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex gap-1 border-b border-border", className)}>
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center gap-2 px-3 py-2.5 text-[14px] font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon && (
              <item.icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.8} />
            )}
            {item.label}
            {/* Sits ON the border rather than replacing it, so the rule below
                the tab strip stays unbroken as the marker moves. */}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
