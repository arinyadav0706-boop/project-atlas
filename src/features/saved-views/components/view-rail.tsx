"use client";

import { Bookmark, Globe, Lock, Trash2, TriangleAlert, Layers } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { SavedViewDto } from "@/features/saved-views/types/saved-view.types";

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
    <div className="rounded-3xl border border-border/60 bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2.5 px-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/12 text-primary">
          <Bookmark className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-bold tracking-tight text-foreground">
          Saved Views
        </h2>
      </div>

      <div className="space-y-1">
        <button
          type="button"
          onClick={onClear}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-2xl px-3.5 py-2.5 text-left text-[13px] font-medium transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
            activeId === null
              ? "bg-gradient-to-r from-primary/15 to-google-purple/10 font-semibold text-primary ring-1 ring-primary/20"
              : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
          )}
        >
          <Layers className="h-4 w-4 shrink-0" />
          <span>All issues</span>
        </button>

        <Group label="My views" views={mine} activeId={activeId} onSelect={selectViewProxy(onSelect)} onDelete={onDelete} />
        <Group label="Shared" views={shared} activeId={activeId} onSelect={selectViewProxy(onSelect)} />

        {views.length === 0 && (
          <p className="rounded-2xl bg-surface-sunken/70 px-3.5 py-4 text-xs leading-relaxed text-muted-foreground">
            No saved views yet. Apply filters on the right, then click Save view.
          </p>
        )}
      </div>
    </div>
  );
}

function selectViewProxy(fn: (v: SavedViewDto) => void) {
  return fn;
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
    <div className="pt-3">
      <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {label}
      </p>
      <ul className="space-y-1">
        {views.map((view) => {
          const active = view.id === activeId;
          return (
            <li key={view.id} className="group/row relative">
              <button
                type="button"
                onClick={() => onSelect(view)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-2xl py-2.5 pl-3.5 pr-9 text-left text-[13px] transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
                  active
                    ? "bg-gradient-to-r from-primary/15 to-google-purple/10 font-semibold text-primary ring-1 ring-primary/20"
                    : "text-foreground hover:bg-muted/60",
                )}
              >
                {view.visibility === "SHARED" ? (
                  <Globe className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-label="Shared" />
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Private" />
                )}
                <span className="min-w-0 flex-1 truncate">{view.name}</span>
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none group-hover/row:opacity-100"
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
