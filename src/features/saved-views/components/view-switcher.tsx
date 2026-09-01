"use client";

import { Bookmark, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import type { SavedViewDto } from "@/features/saved-views/types/saved-view.types";

// Saved views, as a toolbar control (04_Modernization_Audit.md §H).
//
// Replaces `ViewRail`, which was a 15rem left column INSIDE the page, sitting
// next to the application's own 240px sidebar. Two rails to reach a list that
// is usually three items long, on a screen the audit already showed was
// wasting 168–232px per side.
//
// Every behaviour survives: select, clear, delete, and the "active" state. The
// feature did not change; where it lives did.

export function ViewSwitcher({
  views,
  activeView,
  onSelect,
  onClear,
  onDelete,
}: {
  views: SavedViewDto[];
  activeView: SavedViewDto | null;
  onSelect: (view: SavedViewDto) => void;
  onClear: () => void;
  onDelete: (view: SavedViewDto) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("shrink-0 gap-1.5", activeView && "border-accent text-accent")}
        >
          <Bookmark className="size-3.5" />
          <span className="max-w-[10rem] truncate">{activeView?.name ?? "All issues"}</span>
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem onSelect={onClear} className={cn(!activeView && "text-accent")}>
          All issues
        </DropdownMenuItem>

        {views.length > 0 && (
          <div className="my-1 h-px bg-border" role="separator" />
        )}

        {views.map((view) => (
          <DropdownMenuItem
            key={view.id}
            onSelect={() => onSelect(view)}
            className={cn("group justify-between gap-2", activeView?.id === view.id && "text-accent")}
          >
            <span className="min-w-0 flex-1 truncate">{view.name}</span>
            <button
              type="button"
              aria-label={`Delete ${view.name}`}
              // Stop propagation AND preventDefault: the first keeps the click
              // off the menu item, the second keeps the menu from closing
              // before the confirm resolves.
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDelete(view);
              }}
              className="shrink-0 rounded-chip p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus group-hover:opacity-100"
            >
              <Trash2 className="size-3.5" />
            </button>
          </DropdownMenuItem>
        ))}

        {views.length === 0 && (
          <p className="px-2 py-1.5 text-meta text-muted-foreground">
            No saved views yet. Filter the list, then choose Save view.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
