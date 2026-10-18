"use client";

import { signOut, useSession } from "next-auth/react";
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
  searchEnabled?: boolean;
}) {
  const { data: session } = useSession();
  const name = session?.user?.name ?? userName;
  const image = session?.user?.image ?? userImage;

  const initials = name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 shadow-2xs select-none">
      {/* Global ⌘K Search Omnibox */}
      <div className="flex-1 md:max-w-md">
        {searchEnabled && <SearchPalette />}
      </div>

      {/* Right Action Cluster */}
      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-1.5 rounded-full p-0.5 transition-all hover:ring-2 hover:ring-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Avatar className="h-7 w-7 ring-1 ring-border">
                <AvatarImage src={image ?? undefined} alt={name} />
                <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 shadow-pop border-border">
            <div className="px-2.5 py-2 text-xs border-b border-border/50">
              <div className="font-medium text-foreground">{name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{session?.user?.email}</div>
            </div>
            <DropdownMenuItem asChild className="text-xs cursor-pointer">
              <a href="/profile">Profile & Settings</a>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => signOut({ redirectTo: "/sign-in" })}
              className="text-xs text-destructive cursor-pointer focus:text-destructive"
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
