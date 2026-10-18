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
  Sparkles,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { LogoMark } from "@/shared/components/brand/logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: string;
  activeTone: string;
}

const workspaceNavItems: NavItem[] = [
  {
    href: "/home",
    label: "Home",
    icon: House,
    tone: "bg-blue-500/12 text-blue-600 dark:text-blue-400",
    activeTone: "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm",
  },
  {
    href: "/projects",
    label: "Projects",
    icon: FolderKanban,
    tone: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
    activeTone: "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm",
  },
  {
    href: "/issues",
    label: "Issues",
    icon: ListFilter,
    tone: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
    activeTone: "bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-sm",
  },
  {
    href: "/dashboards",
    label: "Dashboards",
    icon: LayoutDashboard,
    tone: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
    activeTone: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm",
  },
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

  const orgItems: NavItem[] = [
    ...(managesTeam
      ? [
          {
            href: "/my-team",
            label: "My team",
            icon: Network,
            tone: "bg-cyan-500/12 text-cyan-600 dark:text-cyan-400",
            activeTone: "bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-sm",
          },
        ]
      : []),
    ...(managesTeam || isOrgAdmin
      ? [
          {
            href: "/workload",
            label: "Workload",
            icon: GaugeCircle,
            tone: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
            activeTone: "bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm",
          },
        ]
      : []),
    ...(isOrgAdmin
      ? [
          {
            href: "/admin",
            label: "Admin",
            icon: ShieldCheck,
            tone: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
            activeTone: "bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-sm",
          },
        ]
      : []),
  ];

  const renderLink = (item: NavItem) => {
    const isActive =
      pathname === item.href || pathname.startsWith(`${item.href}/`);
    return (
      <Link
        key={item.href}
        href={item.href}
        title={item.label}
        className={cn(
          "group relative flex items-center gap-3 rounded-2xl p-2 text-[13px] font-medium transition-all duration-200",
          "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
          isActive
            ? "bg-surface text-foreground font-semibold shadow-xs ring-1 ring-border/70"
            : "text-muted-foreground hover:bg-surface/60 hover:text-foreground",
          collapsed && "justify-center p-2"
        )}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105",
            isActive ? item.activeTone : item.tone
          )}
        >
          <item.icon className="h-4 w-4" strokeWidth={isActive ? 2.2 : 1.9} />
        </span>
        {!collapsed && (
          <span className="hidden truncate md:inline">{item.label}</span>
        )}
        {!collapsed && isActive && (
          <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-primary md:inline-block" />
        )}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "flex h-full shrink-0 flex-col rounded-3xl border border-border/60 bg-surface/85 shadow-card backdrop-blur-xl transition-all duration-200 ease-in-out select-none",
        collapsed ? "w-[4.5rem]" : "w-[4.5rem] md:w-64"
      )}
    >
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between px-3.5">
        <Link
          href="/home"
          className="flex items-center gap-3 overflow-hidden rounded-2xl p-1 transition-opacity hover:opacity-90"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-indigo-500 to-google-purple shadow-glow">
            <LogoMark className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="hidden min-w-0 md:block">
              <div className="flex items-center gap-1.5">
                <span className="text-[15px] font-bold tracking-tight text-foreground">
                  EAGLES
                </span>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/12 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                  <Sparkles className="h-2.5 w-2.5" />
                  Pro
                </span>
              </div>
              <span className="block truncate text-[11px] font-medium text-muted-foreground">
                Delivery Cloud
              </span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="hidden md:flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-2">
        <div className="space-y-1">
          {!collapsed && (
            <p className="hidden px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/75 md:block">
              Workspace
            </p>
          )}
          {workspaceNavItems.map(renderLink)}
        </div>

        {orgItems.length > 0 && (
          <div className="space-y-1">
            {!collapsed && (
              <p className="hidden px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/75 md:block">
                Organization
              </p>
            )}
            {orgItems.map(renderLink)}
          </div>
        )}
      </div>

      {/* User Account Floating Pill */}
      {user && (
        <div className="p-3">
          <Link
            href="/profile"
            className={cn(
              "flex items-center gap-3 rounded-2xl border border-border/60 bg-surface-sunken/80 p-2.5 shadow-2xs transition-all hover:border-border-strong hover:bg-surface",
              collapsed && "justify-center p-2"
            )}
            title={user.email}
          >
            <div className="relative shrink-0">
              <Avatar className="h-8 w-8 ring-2 ring-surface">
                {user.image && <AvatarImage src={user.image} alt={user.name} />}
                <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-primary/20 to-google-purple/20 text-primary">
                  {user.name.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-surface" />
            </div>
            {!collapsed && (
              <>
                <span className="hidden min-w-0 flex-1 md:block">
                  <span className="block truncate text-[13px] font-semibold text-foreground leading-tight">
                    {user.name}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {user.email}
                  </span>
                </span>
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground md:block" />
              </>
            )}
          </Link>
        </div>
      )}
    </nav>
  );
}
