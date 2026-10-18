"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { FolderKanban, ListFilter, Sparkles, User, LogOut } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { SearchPalette } from "@/features/search/components/search-palette";

function resolveSectionLabel(pathname: string): { label: string; badge: string } {
  if (pathname.startsWith("/home")) return { label: "Command Center", badge: "Home" };
  if (pathname.startsWith("/projects/")) return { label: "Project Workspace", badge: "Delivery" };
  if (pathname.startsWith("/projects")) return { label: "Project Portfolio", badge: "Directory" };
  if (pathname.startsWith("/issues")) return { label: "Issue Explorer", badge: "Cross-Project" };
  if (pathname.startsWith("/dashboards")) return { label: "Executive Analytics", badge: "Insights" };
  if (pathname.startsWith("/my-team")) return { label: "Team Operations", badge: "People" };
  if (pathname.startsWith("/workload")) return { label: "Capacity & Workload", badge: "Planning" };
  if (pathname.startsWith("/admin")) return { label: "Organization Console", badge: "Governance" };
  if (pathname.startsWith("/profile")) return { label: "Account & Developer", badge: "Preferences" };
  return { label: "Workspace", badge: "EAGLES" };
}

export function TopBar({
  userName,
  userImage,
  searchEnabled = true,
}: {
  userName: string;
  userImage?: string | null;
  searchEnabled?: boolean;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const name = session?.user?.name ?? userName;
  const image = session?.user?.image ?? userImage;
  const firstName = name.split(" ")[0] ?? name;

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const section = resolveSectionLabel(pathname);

  return (
    <header className="flex h-15 shrink-0 items-center justify-between gap-4 border-b border-border-subtle/80 bg-surface/80 px-5 py-2.5 backdrop-blur-md select-none md:px-7">
      {/* Left Context Pill */}
      <div className="hidden items-center gap-2.5 lg:flex">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
          <Sparkles className="h-3 w-3" />
          {section.badge}
        </span>
        <span className="text-[13px] font-semibold text-foreground">
          {section.label}
        </span>
      </div>

      {/* Global ⌘K Spotlight Omnibox */}
      <div className="flex-1 max-w-md">
        {searchEnabled && <SearchPalette />}
      </div>

      {/* Right Action Cluster */}
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1.5 sm:flex">
          <Link
            href="/projects"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-surface-sunken/70 px-3 text-xs font-medium text-muted-foreground transition-all hover:border-border-strong hover:bg-surface hover:text-foreground"
          >
            <FolderKanban className="h-3.5 w-3.5 text-violet-500" />
            <span>Projects</span>
          </Link>
          <Link
            href="/issues"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-surface-sunken/70 px-3 text-xs font-medium text-muted-foreground transition-all hover:border-border-strong hover:bg-surface hover:text-foreground"
          >
            <ListFilter className="h-3.5 w-3.5 text-indigo-500" />
            <span>Issues</span>
          </Link>
        </div>

        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-full border border-border/70 bg-surface-sunken/70 py-1 pl-1 pr-3 text-xs font-semibold text-foreground shadow-2xs transition-all hover:border-border-strong hover:bg-surface focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
              <Avatar className="h-7 w-7 ring-1 ring-border/60">
                <AvatarImage src={image ?? undefined} alt={name} />
                <AvatarFallback className="text-[10px] font-bold bg-primary/15 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:inline">{firstName}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="px-3 py-2.5 border-b border-border-subtle mb-1">
              <div className="text-[13px] font-semibold text-foreground">{name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {session?.user?.email}
              </div>
            </div>
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/profile">
                <User className="h-4 w-4 text-muted-foreground" />
                <span>Profile & Preferences</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => signOut({ redirectTo: "/sign-in" })}
              className="text-destructive cursor-pointer focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
