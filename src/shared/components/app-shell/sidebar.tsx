"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  FolderKanban,
  LayoutDashboard,
  ListFilter,
  ShieldCheck,
  Network,
  GaugeCircle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { LogoMark } from "@/shared/components/brand/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";

// App shell — docs/05_UI/02_Screens_and_Information_Architecture.md §1.
// Admin/My-Team link visibility is a UX convenience; the security boundary is
// server-side in each module's services (Coding Standards §7).
const navItems = [
  { href: "/home", label: "Home", icon: House },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  // Cross-project issues + saved views (ADR-0040). Everyone gets it: the
  // service scopes results to the caller's own memberships, so there is
  // nothing to gate — an unaffiliated user simply sees an empty list.
  { href: "/issues", label: "Issues", icon: ListFilter },
  // Dashboards are everyone's, not an admin surface (ADR-0044 §1): the same
  // per-viewer project scope applies, so there is nothing to gate.
  { href: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
];

export function Sidebar({
  isOrgAdmin,
  managesTeam = false,
  user,
}: {
  isOrgAdmin: boolean;
  managesTeam?: boolean;
  /** Anchored at the bottom of the rail — whose account this is, always visible. */
  user?: { name: string; email: string; image?: string | null };
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
    // White, like the cards — the tinted canvas is the page body only, so the
    // chrome reads as one continuous frame around it.
    <nav className="flex h-full w-14 shrink-0 flex-col border-r border-border bg-background md:w-60">
      <div className="flex h-14 items-center justify-center gap-2 md:justify-start md:px-4">
        <LogoMark className="h-7 w-7" />
        <span className="hidden text-[15px] font-semibold tracking-tight text-foreground md:inline">
          EAGLES
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 px-2 pt-2 md:px-3">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-colors duration-150 md:justify-start",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                isActive
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon
                className="h-[18px] w-[18px] shrink-0"
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
      </div>

      {user && (
        <Link
          href="/profile"
          className="m-2 flex items-center gap-2.5 rounded-xl border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-muted md:m-3"
          title={user.email}
        >
          <Avatar className="h-8 w-8 shrink-0">
            {user.image && <AvatarImage src={user.image} alt="" />}
            <AvatarFallback className="text-[11px]">
              {user.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="hidden min-w-0 flex-1 md:block">
            <span className="block truncate text-[13px] font-medium text-foreground">
              {user.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {user.email}
            </span>
          </span>
          <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />
        </Link>
      )}
    </nav>
  );
}
