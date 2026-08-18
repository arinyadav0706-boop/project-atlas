"use client";

import { Bookmark, Globe, Lock, Trash2, TriangleAlert } from "lucide-react";
import { Card, CardHeader } from "@/shared/components/ui/card";
import { cn } from "@/shared/lib/utils";
import type { SavedViewDto } from "@/features/saved-views/types/saved-view.types";

// The saved views a reader may open: their own, plus everything shared.
//
// Private/shared is shown with an icon rather than a word — the rail is narrow,
// and the distinction matters most when scanning, not when reading.
export function ViewRail({
  views,
  activeId,
  onSelect,
  onClear,
  onDelete,
}: {
  views: SavedViewDto[];
  activeId: string | null;
  onSelect: (view: SavedViewDto) => void;
  onClear: () => void;
  onDelete: (view: SavedViewDto) => void;
}) {
  const mine = views.filter((v) => v.canEdit);
  const shared = views.filter((v) => !v.canEdit);

  return (
    <Card>
      <CardHeader icon={<Bookmark />} title="Views" />
      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={onClear}
          className={cn(
            "mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            activeId === null
              ? "bg-accent/10 text-accent"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          All issues
        </button>

        <Group label="My views" views={mine} activeId={activeId} onSelect={onSelect} onDelete={onDelete} />
        <Group label="Shared" views={shared} activeId={activeId} onSelect={onSelect} />

        {views.length === 0 && (
          <p className="px-3 py-4 text-[13px] text-muted-foreground">
            No saved views yet. Filter the list, then choose Save view.
          </p>
        )}
      </div>
    </Card>
  );
}

function Group({
  label,
  views,
  activeId,
  onSelect,
  onDelete,
}: {
  label: string;
  views: SavedViewDto[];
  activeId: string | null;
  onSelect: (view: SavedViewDto) => void;
  onDelete?: (view: SavedViewDto) => void;
}) {
  if (views.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-0.5">
        {views.map((view) => {
          const active = view.id === activeId;
          return (
            <li key={view.id} className="group/row relative">
              <button
                type="button"
                onClick={() => onSelect(view)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-xl py-2 pl-3 pr-8 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active
                    ? "bg-accent/10 font-medium text-accent"
                    : "text-foreground hover:bg-muted/60",
                )}
              >
                {view.visibility === "SHARED" ? (
                  <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Shared" />
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Private" />
                )}
                <span className="min-w-0 flex-1 truncate">{view.name}</span>
                {/* BR-8: a rotted filter still opens, and says so. */}
                {view.filterCorrupt && (
                  <TriangleAlert
                    className="h-3.5 w-3.5 shrink-0 text-warning"
                    aria-label="This view's saved filter could not be read"
                  />
                )}
              </button>

              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(view)}
                  aria-label={`Delete ${view.name}`}
                  // Revealed on hover/focus so the rail stays quiet, but always
                  // reachable by keyboard.
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent group-hover/row:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
