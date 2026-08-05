"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, FolderKanban, ShieldCheck, Network, GaugeCircle } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { LogoMark } from "@/shared/components/brand/logo";

// App shell — docs/05_UI/02_Screens_and_Information_Architecture.md §1.
// Admin/My-Team link visibility is a UX convenience; the security boundary is
// server-side in each module's services (Coding Standards §7).
const navItems = [
  { href: "/home", label: "Home", icon: House },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

export function Sidebar({
  isOrgAdmin,
  managesTeam = false,
}: {
  isOrgAdmin: boolean;
  managesTeam?: boolean;
}) {
  const pathname = usePathname();

  // "My Team" appears for managers (ADR-0032); Workload for managers and org
  // admins (21_workload.md BR-8); Admin for org admins.
  const items = [
    ...navItems,
    ...(managesTeam ? [{ href: "/my-team", label: "My team", icon: Network }] : []),
    ...(managesTeam || isOrgAdmin
      ? [{ href: "/workload", label: "Workload", icon: GaugeCircle }]
      : []),
    ...(isOrgAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  // Below md the sidebar collapses to an icon rail so the app stays usable
  // on small screens; a full mobile drawer is tracked as a later pass.
  return (
    <nav className="flex h-full w-14 flex-col border-r border-border bg-surface md:w-60">
      <div className="flex h-14 items-center justify-center gap-2 md:justify-start md:px-4">
        <LogoMark className="h-7 w-7" />
        <span className="hidden text-[15px] font-semibold tracking-tight text-foreground md:inline">
          EAGLES
        </span>
      </div>

      <div className="flex flex-col gap-0.5 px-2 pt-2 md:px-3">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center justify-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors duration-150 md:justify-start",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon
                className="h-4 w-4 shrink-0"
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
