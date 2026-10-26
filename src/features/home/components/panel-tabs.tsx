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
    <nav aria-label={label} className="flex items-center gap-3.5">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          scroll={false}
          aria-current={tab.active ? "page" : undefined}
          className={cn(
            // Underlined, as in the reference: a tab strip, not a row of chips.
            "relative py-1.5 text-[12px] leading-4 font-medium whitespace-nowrap transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            tab.active
              ? "text-accent after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-accent"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
