"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";

// Project-scoped sub-navigation. The board/backlog/sprint tabs arrive with
// their modules; for now, Issues (primary) and Settings.
export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/projects/${projectId}/issues`, label: "Issues" },
    { href: `/projects/${projectId}/settings`, label: "Settings" },
  ];

  return (
    <nav className="flex gap-1 border-b border-border">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "relative px-3 py-2.5 text-sm font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
