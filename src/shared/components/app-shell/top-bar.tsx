"use client";

import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { SearchPalette } from "@/features/search/components/search-palette";

export function TopBar({
  userName,
  userImage,
  searchEnabled = true,
}: {
  userName: string;
  userImage?: string | null;
  // Gated by the platform.commandPalette feature flag (ADR-0023), decided
  // server-side in the app layout.
  searchEnabled?: boolean;
}) {
  const initials = userName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-5">
      <div className="flex-1">{searchEnabled && <SearchPalette />}</div>
      <NotificationBell />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            <Avatar className="h-8 w-8">
              <AvatarImage src={userImage ?? undefined} alt={userName} />
              <AvatarFallback className="text-xs font-medium">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <div className="px-2 py-1.5 text-xs text-muted-foreground">{userName}</div>
          <DropdownMenuItem asChild>
            <a href="/profile">Profile</a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => signOut({ redirectTo: "/sign-in" })}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
