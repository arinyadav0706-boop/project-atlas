import Link from "next/link";
import { cn } from "@/shared/lib/utils";

// Small in-panel tabs for Home (BR-13, BR-14). Links, not client state: a tab
// is a URL parameter, so it is shareable, survives a reload and works without
// JavaScript. `scroll={false}` keeps the reader where they were — switching a
// tab halfway down the page must not jump them back to the top.
export function PanelTabs({
  label,
  tabs,
}: {
  label: string;
  tabs: { href: string; label: string; active: boolean }[];
}) {
  return (
    <nav aria-label={label} className="flex items-center gap-0.5">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            "rounded-chip px-2 py-0.5 text-meta font-medium whitespace-nowrap transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            tab.active
              ? "bg-accent/10 text-accent"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
