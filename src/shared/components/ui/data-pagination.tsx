"use client";

import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

export interface NumberedPaginationProps {
  mode: "numbered";
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  itemLabel?: string;
}

export interface CursorPaginationProps {
  mode: "cursor";
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  rangeLabel?: string;
  totalLabel?: string;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export type DataPaginationProps = NumberedPaginationProps | CursorPaginationProps;

function generatePageNumbers(current: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis", totalPages];
  }
  if (current >= totalPages - 3) {
    return [1, "ellipsis", totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", totalPages];
}

export function DataPagination(props: DataPaginationProps) {
  const { className, pageSizeOptions = [10, 25, 50, 100] } = props;

  if (props.mode === "cursor") {
    const { hasPrev, hasNext, onPrev, onNext, rangeLabel, totalLabel, pageSize, onPageSizeChange } = props;

    return (
      <nav
        aria-label="Cursor pagination"
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 border-t border-border/50 bg-surface-sunken/50 px-5 py-3.5 text-[13px] text-muted-foreground transition-colors",
          className
        )}
      >
        <div className="flex items-center gap-2">
          {rangeLabel && (
            <span className="font-semibold text-foreground tabular-nums">
              Showing {rangeLabel}
            </span>
          )}
          {totalLabel && (
            <span className="text-muted-foreground">
              of {totalLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {onPageSizeChange && pageSize !== undefined && (
            <div className="flex items-center gap-2">
              <span className="hidden text-muted-foreground sm:inline">Rows per page</span>
              <select
                aria-label="Items per page"
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="h-8 rounded-xl border border-border/80 bg-surface px-2.5 text-xs font-semibold text-foreground shadow-2xs transition-colors hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="Previous page"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-xl border border-border/80 bg-surface px-3 text-xs font-semibold text-foreground shadow-2xs transition-all",
                hasPrev
                  ? "hover:border-border-strong hover:bg-muted/50 active:scale-95"
                  : "cursor-not-allowed opacity-40"
              )}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
              <span>Previous</span>
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!hasNext}
              aria-label="Next page"
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-xl border border-border/80 bg-surface px-3 text-xs font-semibold text-foreground shadow-2xs transition-all",
                hasNext
                  ? "hover:border-border-strong hover:bg-muted/50 active:scale-95"
                  : "cursor-not-allowed opacity-40"
              )}
            >
              <span>Next</span>
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </nav>
    );
  }

  // Numbered Mode
  const { page, pageSize, total, onPageChange, onPageSizeChange, itemLabel = "records" } = props;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startRecord = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(total, page * pageSize);
  const pages = generatePageNumbers(page, totalPages);

  return (
    <nav
      aria-label="Data table pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border/50 bg-surface-sunken/50 px-5 py-3.5 text-[13px] text-muted-foreground transition-colors",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground tabular-nums">
          Showing {startRecord}–{endRecord}
        </span>
        <span className="text-muted-foreground">
          of {total.toLocaleString()} {itemLabel}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="hidden text-muted-foreground sm:inline">Per page</span>
            <select
              aria-label="Items per page"
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="h-8 rounded-xl border border-border/80 bg-surface px-2.5 text-xs font-semibold text-foreground shadow-2xs transition-colors hover:border-border-strong focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            aria-label="Go to first page"
            className={cn(
              "hidden h-8 w-8 items-center justify-center rounded-xl border border-border/80 bg-surface text-foreground shadow-2xs transition-all sm:inline-flex",
              page > 1
                ? "hover:border-border-strong hover:bg-muted/50 active:scale-95"
                : "cursor-not-allowed opacity-40"
            )}
          >
            <ChevronsLeft className="h-3.5 w-3.5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Go to previous page"
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-xl border border-border/80 bg-surface px-3 text-xs font-semibold text-foreground shadow-2xs transition-all",
              page > 1
                ? "hover:border-border-strong hover:bg-muted/50 active:scale-95"
                : "cursor-not-allowed opacity-40"
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Prev</span>
          </button>

          <div className="hidden items-center gap-1 md:flex">
            {pages.map((p, i) =>
              p === "ellipsis" ? (
                <span
                  key={`ellipsis-${i}`}
                  className="flex h-8 w-8 select-none items-center justify-center text-xs text-muted-foreground/60"
                  aria-hidden
                >
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPageChange(p)}
                  aria-current={p === page ? "page" : undefined}
                  aria-label={`Page ${p}`}
                  className={cn(
                    "flex h-8 min-w-[32px] items-center justify-center rounded-xl px-2.5 text-xs font-semibold tabular-nums transition-all",
                    p === page
                      ? "bg-gradient-to-b from-primary to-primary/90 text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  {p}
                </button>
              )
            )}
          </div>

          <span className="px-2 text-xs font-semibold text-foreground tabular-nums md:hidden">
            {page} / {totalPages}
          </span>

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Go to next page"
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-xl border border-border/80 bg-surface px-3 text-xs font-semibold text-foreground shadow-2xs transition-all",
              page < totalPages
                ? "hover:border-border-strong hover:bg-muted/50 active:scale-95"
                : "cursor-not-allowed opacity-40"
            )}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            aria-label="Go to last page"
            className={cn(
              "hidden h-8 w-8 items-center justify-center rounded-xl border border-border/80 bg-surface text-foreground shadow-2xs transition-all sm:inline-flex",
              page < totalPages
                ? "hover:border-border-strong hover:bg-muted/50 active:scale-95"
                : "cursor-not-allowed opacity-40"
            )}
          >
            <ChevronsRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </nav>
  );
}
