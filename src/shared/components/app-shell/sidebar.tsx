"use client";

import * as React from "react";
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
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { LogoMark } from "@/shared/components/brand/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";

const navItems = [
  { href: "/home", label: "Home", icon: House },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/issues", label: "Issues", icon: ListFilter },
  { href: "/dashboards", label: "Dashboards", icon: LayoutDashboard },
];

export function Sidebar({
  isOrgAdmin,
  managesTeam = false,
  user,
}: {
  isOrgAdmin: boolean;
  managesTeam?: boolean;
  user?: { name: string; email: string; image?: string | null };
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  const items = [
    ...navItems,
    ...(managesTeam ? [{ href: "/my-team", label: "My team", icon: Network }] : []),
    ...(managesTeam || isOrgAdmin
      ? [{ href: "/workload", label: "Workload", icon: GaugeCircle }]
      : []),
    ...(isOrgAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <nav
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-surface transition-all duration-200 ease-in-out select-none",
        collapsed ? "w-16" : "w-16 md:w-60"
      )}
    >
      {/* Brand & Toggle Header */}
      <div className="flex h-12 items-center justify-between px-3.5 border-b border-border/40">
        <Link
          href="/home"
          className="flex items-center gap-2.5 overflow-hidden transition-opacity hover:opacity-90"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-primary to-google-purple shadow-sm">
            <LogoMark className="h-4 w-4 text-white" />
          </div>
          {!collapsed && (
            <span className="hidden text-sm font-semibold tracking-tight text-foreground md:inline">
              EAGLES
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden md:flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation Links */}
      <div className="flex flex-1 flex-col gap-1 px-2 pt-3">
        {items.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-xs font-medium transition-all duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                isActive
                  ? "bg-primary/10 text-primary font-semibold shadow-xs"
                  : "text-muted-foreground hover:bg-muted/80 hover:text-foreground",
                collapsed && "justify-center px-0"
              )}
            >
              <item.icon
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-150 group-hover:scale-105",
                  isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                )}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              {!collapsed && (
                <span className="hidden truncate md:inline">{item.label}</span>
              )}
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary" />
              )}
            </Link>
          );
        })}
      </div>

      {/* User Account / Profile Footprint */}
      {user && (
        <div className="p-2 border-t border-border/40">
          <Link
            href="/profile"
            className={cn(
              "flex items-center gap-2.5 rounded-md p-1.5 transition-colors hover:bg-muted/80",
              collapsed && "justify-center p-1"
            )}
            title={user.email}
          >
            <Avatar className="h-7 w-7 shrink-0 ring-1 ring-border">
              {user.image && <AvatarImage src={user.image} alt={user.name} />}
              <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
                {user.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <>
                <span className="hidden min-w-0 flex-1 md:block">
                  <span className="block truncate text-xs font-medium text-foreground leading-tight">
                    {user.name}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {user.email}
                  </span>
                </span>
                <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground md:block" />
              </>
            )}
          </Link>
        </div>
      )}
    </nav>
  );
}
