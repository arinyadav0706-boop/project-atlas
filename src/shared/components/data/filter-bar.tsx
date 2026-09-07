"use client";

import * as React from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/utils";

// The filter grammar, shared by every workspace toolbar.
//
// It was written once for /issues, and the Board needed the same thing three
// days later — eight controls that do not fit in a toolbar at any width, and a
// reader who has to be told WHICH filter is hiding the row they came for.
// Copying it would have been faster and would have produced two filter bars
// that drift apart by one padding value a month.
//
// The shape is: [search] [Filters (n)] [chip] [chip] … [Clear], with every
// facet inside the panel. Jira, ClickUp and Linear all land here; the chips are
// the part that matters, because a bare "Filters (3)" tells you a filter exists
// and not which one.

/** One active filter, stated and removable. */
export function FilterChip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove: () => void;
}) {
  return (
    <span className="flex h-ctl-lg shrink-0 items-center gap-1 rounded-control border border-border bg-background pl-2 pr-1 text-body">
      <span className="text-muted-foreground">{label}:</span>
      <span className="max-w-[12rem] truncate font-medium text-foreground">{value}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove the ${label} filter`}
        className="rounded-chip p-0.5 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/** The control that opens the panel, carrying how many facets are on. */
export function FiltersButton({
  count,
  onClick,
  className,
}: {
  count: number;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("shrink-0", className)}
      onClick={onClick}
      // The badge is a number in a coloured pill; without this it is announced
      // as a bare "3" after the word "Filters".
      aria-label={count > 0 ? `Filters, ${count} active` : "Filters"}
    >
      <SlidersHorizontal className="size-3.5" />
      Filters
      {count > 0 && (
        <span className="ml-0.5 rounded-chip bg-accent px-1.5 text-meta font-semibold text-accent-foreground">
          {count}
        </span>
      )}
    </Button>
  );
}

/** A labelled row inside the panel. One column width for every facet. */
export function FilterRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3">
      <span className="text-label text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Multi-select facets (labels, components) — a row of toggles, not a menu. */
export function FilterToggleGroup({
  options,
  selected,
  onToggle,
  emptyLabel = "None available",
}: {
  options: { id: string; label: string }[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  emptyLabel?: string;
}) {
  if (options.length === 0) {
    return <span className="text-meta text-muted-foreground">{emptyLabel}</span>;
  }
  const chosen = new Set(selected);
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = chosen.has(option.id);
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(option.id)}
            className={cn(
              "h-ctl-md rounded-control border px-2 text-meta transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              on
                ? "border-accent bg-accent font-medium text-accent-foreground"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The panel itself: every facet, a Clear all, and a Done. */
export function FilterPanel({
  open,
  onOpenChange,
  children,
  onClearAll,
  canClear,
  description = "Narrow the list. The URL updates as you go, so the result is shareable.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  onClearAll: () => void;
  canClear: boolean;
  description?: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Filters</DialogTitle>
        <DialogDescription>{description}</DialogDescription>

        <div className="mt-4 max-h-[60vh] space-y-2.5 overflow-y-auto pr-1">{children}</div>

        <div className="mt-5 flex items-center justify-between">
          <Button variant="ghost" size="sm" disabled={!canClear} onClick={onClearAll}>
            Clear all
          </Button>
          <DialogClose asChild>
            <Button size="sm">Done</Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
