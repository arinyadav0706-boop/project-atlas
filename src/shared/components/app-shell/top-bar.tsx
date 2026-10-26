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
  // Gated by the platform.commandPalette feature flag (ADR-0023), decided
  // server-side in the app layout.
  searchEnabled?: boolean;
}) {
  // Prefer the live client session over the server-rendered props so a profile
  // edit (name/avatar) reflects here immediately after the page calls
  // useSession().update() — no re-login, no full navigation (ADR-0027). The
  // props are the SSR fallback for the first paint before the session loads.
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
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border bg-background px-6">
      {/* Bounded rather than `flex-1`: a search field stretched across a
          1600px window reads as a page-wide input, not a control. 600px is the
          approved reference's width. */}
      <div className="flex-1 md:max-w-[602px]">{searchEnabled && <SearchPalette />}</div>
      {/* `ml-auto` pins the cluster to the right edge. Without it the bounded
          search box stops stretching and the bell and avatar sit stranded in
          the middle of a wide window instead of at the corner. */}
      <div className="ml-auto flex items-center gap-2">
        <NotificationBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* The name beside the avatar, as in the reference: whose account
                this is should not take a click to find out. */}
            <button className="flex items-center gap-2 rounded-full pr-1 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <Avatar className="h-8 w-8">
                <AvatarImage src={image ?? undefined} alt="" />
                <AvatarFallback className="text-xs font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              {/* Screen-reader text below md, so the button always has a name. */}
              <span className="sr-only text-[12px] font-medium text-foreground md:not-sr-only md:inline-block md:max-w-[10rem] md:truncate">
                {name}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{name}</div>
            <DropdownMenuItem asChild>
              <a href="/profile">Profile</a>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => signOut({ redirectTo: "/sign-in" })}>
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
