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
  /** e.g. "1–25" or "Page 2" */
  rangeLabel?: string;
  /** e.g. "438 issues in scope" */
  totalLabel?: string;
  pageSize?: number;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export type DataPaginationProps = NumberedPaginationProps | CursorPaginationProps;

/**
 * Generates an array of page numbers with smart ellipsis:
 * e.g. [1, 2, 3, 4, 'ellipsis', 18] or [1, 'ellipsis', 4, 5, 6, 'ellipsis', 20]
 */
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
          "flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-surface/50 px-4 py-2.5 text-xs text-muted-foreground transition-colors sm:px-6",
          className
        )}
      >
        <div className="flex items-center gap-2">
          {rangeLabel && (
            <span className="font-medium text-foreground tabular-nums">
              Showing {rangeLabel}
            </span>
          )}
          {totalLabel && (
            <span className="text-muted-foreground/80">
              of {totalLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {onPageSizeChange && pageSize !== undefined && (
            <div className="flex items-center gap-1.5">
              <span className="hidden text-muted-foreground sm:inline">Per page:</span>
              <select
                aria-label="Items per page"
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="h-7 rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground transition-colors hover:border-border-strong focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {pageSizeOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              disabled={!hasPrev}
              aria-label="Previous page"
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-all",
                hasPrev
                  ? "hover:border-border-strong hover:bg-muted/40 active:scale-95"
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
                "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2.5 text-xs font-medium text-foreground transition-all",
                hasNext
                  ? "hover:border-border-strong hover:bg-muted/40 active:scale-95"
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
        "flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-surface/50 px-4 py-2.5 text-xs text-muted-foreground transition-colors sm:px-6",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-foreground tabular-nums">
          Showing {startRecord}–{endRecord}
        </span>
        <span className="text-muted-foreground/80">
          of {total.toLocaleString()} {itemLabel}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="hidden text-muted-foreground sm:inline">Per page:</span>
            <select
              aria-label="Items per page"
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="h-7 rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground transition-colors hover:border-border-strong focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex items-center gap-1">
          {/* First page button */}
          <button
            type="button"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            aria-label="Go to first page"
            className={cn(
              "hidden h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-foreground transition-all sm:inline-flex",
              page > 1
                ? "hover:border-border-strong hover:bg-muted/40 active:scale-95"
                : "cursor-not-allowed opacity-40"
            )}
          >
            <ChevronsLeft className="h-3.5 w-3.5" aria-hidden />
          </button>

          {/* Previous page button */}
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Go to previous page"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground transition-all",
              page > 1
                ? "hover:border-border-strong hover:bg-muted/40 active:scale-95"
                : "cursor-not-allowed opacity-40"
            )}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Prev</span>
          </button>

          {/* Numbered Pills */}
          <div className="hidden items-center gap-1 md:flex">
            {pages.map((p, i) =>
              p === "ellipsis" ? (
                <span
                  key={`ellipsis-${i}`}
                  className="flex h-7 w-7 select-none items-center justify-center text-xs text-muted-foreground/60"
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
                    "flex h-7 min-w-[28px] items-center justify-center rounded-md px-2 text-xs font-medium tabular-nums transition-all",
                    p === page
                      ? "bg-primary font-semibold text-primary-foreground shadow-2xs"
                      : "border border-transparent text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-foreground"
                  )}
                >
                  {p}
                </button>
              )
            )}
          </div>

          {/* Current page indicator on small screens */}
          <span className="px-2 text-xs font-medium text-foreground tabular-nums md:hidden">
            {page} / {totalPages}
          </span>

          {/* Next page button */}
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Go to next page"
            className={cn(
              "inline-flex h-7 items-center gap-1 rounded-md border border-border bg-surface px-2 text-xs font-medium text-foreground transition-all",
              page < totalPages
                ? "hover:border-border-strong hover:bg-muted/40 active:scale-95"
                : "cursor-not-allowed opacity-40"
            )}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>

          {/* Last page button */}
          <button
            type="button"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            aria-label="Go to last page"
            className={cn(
              "hidden h-7 w-7 items-center justify-center rounded-md border border-border bg-surface text-foreground transition-all sm:inline-flex",
              page < totalPages
                ? "hover:border-border-strong hover:bg-muted/40 active:scale-95"
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
