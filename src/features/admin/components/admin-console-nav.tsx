"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/lib/utils";
import { ADMIN_SECTIONS } from "@/features/admin/registry/admin-sections";

// Console tabs from the section registry (ADR-0022 §3), filtered to the ids the
// server said this actor may see. New admin areas appear here automatically —
// one registry entry, no edit to this component.
export function AdminConsoleNav({ allowedIds }: { allowedIds: string[] }) {
  const pathname = usePathname();
  const sections = ADMIN_SECTIONS.filter((s) => allowedIds.includes(s.id)).sort(
    (a, b) => a.order - b.order,
  );

  return (
    <nav className="flex gap-1 border-b border-border">
      {sections.map((section) => {
        const isActive = pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <Link
            key={section.id}
            href={section.href}
            className={cn(
              "flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              isActive
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <section.icon className="h-4 w-4" strokeWidth={isActive ? 2.2 : 1.8} />
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
