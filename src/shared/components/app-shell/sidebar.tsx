"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FolderKanban, ShieldCheck } from "lucide-react";
import { cn } from "@/shared/lib/utils";

// App shell — docs/05_UI/02_Screens_and_Information_Architecture.md §1.
// Admin link visibility (ADMIN-only) is a UX convenience; the security
// boundary is server-side in the admin module's services (Coding
// Standards §7).
const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

export function Sidebar({ isOrgAdmin }: { isOrgAdmin: boolean }) {
  const pathname = usePathname();

  const items = isOrgAdmin
    ? [...navItems, { href: "/admin", label: "Admin", icon: ShieldCheck }]
    : navItems;

  return (
    <nav className="flex h-full w-60 flex-col border-r border-border bg-surface">
      <div className="flex h-14 items-center px-5">
        <span className="text-[15px] font-semibold tracking-tight text-foreground">
          EAGLES
        </span>
      </div>

      <div className="flex flex-col gap-0.5 px-3 pt-2">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors duration-150",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" strokeWidth={isActive ? 2.2 : 1.8} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
