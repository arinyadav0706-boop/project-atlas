"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { cn } from "@/shared/lib/utils";

// The dense table (04_Modernization_Audit.md §F3).
//
// Six bespoke table implementations exist in this codebase, with row heights
// measured at 38, 44 and 45px on three pages. This is the one they converge on.
//
// NO TABLE LIBRARY, deliberately — see 05_Dependency_Review.md §3. Sorting is
// already server-side, selection is already a `Set`, and column
// resize/reorder/pinning are features nobody has asked for. TanStack Table
// would have run in `manualSorting` mode as a state container: indirection, not
// capability.
//
// But the API below is exactly the one a library needs — `id`, `header`,
// `width`, `align`, `cell`, plus controlled sort and selection. If column
// resizing is ever approved, TanStack replaces the internals of THIS FILE and
// no page that consumes it changes. That is the whole reason to defer with a
// clear conscience.
//
// Layout is CSS Grid rather than <table>: one `gridTemplateColumns` on the
// header and each row keeps them aligned, while letting a row be a single
// focusable, clickable element — which a <tr> of <td>s makes awkward.

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  /** Any CSS grid track: `minmax(0,1fr)`, `120px`, `auto`. */
  width: string;
  align?: "start" | "center" | "end";
  /** Omit to make the column unsortable. Passed back to `onSortChange`. */
  sortKey?: string;
  cell: (row: T) => React.ReactNode;
  /** Hidden below this breakpoint; the column still occupies no space. */
  hideBelow?: "sm" | "md" | "lg";
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Enables the checkbox column. Omit for a read-only table. */
  selection?: {
    selected: Set<string>;
    onToggle: (id: string) => void;
    onToggleAll: () => void;
    /** Sentence under the header — "Select all 50 on this page" (ADR-0041 §3). */
    label: string;
  };
  /**
   * Controlled sort. Deliberately `(key, direction)` rather than an encoded
   * string: this page's API already has its own vocabulary (`UPDATED_DESC`),
   * and baking a `"key:asc"` format in here would make every consumer
   * translate twice.
   */
  sort?: {
    key: string | null;
    direction: "asc" | "desc";
    onChange: (key: string, direction: "asc" | "desc") => void;
  };
  onRowClick?: (row: T) => void;
  /** Rendered in place of rows. The table keeps its header so the page holds still. */
  empty?: React.ReactNode;
  loading?: boolean;
  density?: "compact" | "comfortable";
  className?: string;
}

const ALIGN = {
  start: "justify-start text-left",
  center: "justify-center text-center",
  end: "justify-end text-right",
} as const;

const HIDE = {
  sm: "hidden sm:flex",
  md: "hidden md:flex",
  lg: "hidden lg:flex",
} as const;

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  selection,
  sort,
  onRowClick,
  empty,
  loading = false,
  density = "compact",
  className,
}: DataTableProps<T>) {
  const rowHeight = density === "compact" ? "h-row-compact" : "h-row-comfy";
  // The checkbox column is a real track so the header and every row agree on
  // where column one starts. Adding it with padding instead is how these
  // tables drift a pixel per page.
  const template = [selection ? "36px" : null, ...columns.map((c) => c.width)]
    .filter(Boolean)
    .join(" ");

  const allSelected =
    selection !== undefined && rows.length > 0 && rows.every((r) => selection.selected.has(rowKey(r)));

  function toggleSort(column: Column<T>) {
    if (!column.sortKey || !sort) return;
    const active = sort.key === column.sortKey;
    // First click on a new column sorts ascending; clicking the active one
    // flips it. Same behaviour as every spreadsheet anyone has used.
    sort.onChange(column.sortKey, active && sort.direction === "asc" ? "desc" : "asc");
  }

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      {/* Sticky, not scrolled away: a dense table whose headers vanish is a
          grid of unlabelled strings. */}
      <div
        role="row"
        className="sticky top-0 z-10 grid h-col-head shrink-0 items-center gap-2 border-b border-border-strong bg-surface-sunken px-4 text-label uppercase tracking-wide text-muted-foreground"
        style={{ gridTemplateColumns: template }}
      >
        {selection && (
          <div className="flex items-center">
            <Checkbox
              checked={allSelected}
              aria-label={selection.label}
              onClick={selection.onToggleAll}
            />
          </div>
        )}
        {columns.map((column) => {
          const active = column.sortKey !== undefined && sort?.key === column.sortKey;
          const Icon = !active ? ChevronsUpDown : sort?.direction === "asc" ? ArrowUp : ArrowDown;
          return (
            <div
              key={column.id}
              role="columnheader"
              aria-sort={
                active ? (sort?.direction === "asc" ? "ascending" : "descending") : undefined
              }
              className={cn(
                "flex min-w-0 items-center gap-1",
                ALIGN[column.align ?? "start"],
                column.hideBelow && HIDE[column.hideBelow],
              )}
            >
              {column.sortKey && sort ? (
                <button
                  type="button"
                  onClick={() => toggleSort(column)}
                  className="flex min-w-0 items-center gap-1 rounded-chip py-0.5 uppercase transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  <span className="truncate">{column.header}</span>
                  <Icon className={cn("size-3 shrink-0", !active && "opacity-40")} />
                </button>
              ) : (
                <span className="truncate">{column.header}</span>
              )}
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="divide-y divide-border-subtle">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={cn(rowHeight, "animate-pulse bg-muted/40")} />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8">{empty}</div>
      ) : (
        <div role="rowgroup" className="divide-y divide-border-subtle">
          {rows.map((row) => {
            const id = rowKey(row);
            const isSelected = selection?.selected.has(id) ?? false;
            return (
              <div
                key={id}
                role="row"
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "grid items-center gap-2 px-4 text-body transition-colors",
                  rowHeight,
                  isSelected ? "bg-accent/[0.07]" : "hover:bg-muted/50",
                  onRowClick && "cursor-pointer",
                )}
                style={{ gridTemplateColumns: template }}
              >
                {selection && (
                  <div
                    className="flex items-center"
                    // The checkbox is inside a clickable row; without this a
                    // tick would also open the issue.
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      aria-label={`Select ${id}`}
                      onClick={() => selection.onToggle(id)}
                    />
                  </div>
                )}
                {columns.map((column) => (
                  <div
                    key={column.id}
                    role="cell"
                    className={cn(
                      "flex min-w-0 items-center",
                      ALIGN[column.align ?? "start"],
                      column.hideBelow && HIDE[column.hideBelow],
                    )}
                  >
                    {column.cell(row)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
