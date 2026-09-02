"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { cn } from "@/shared/lib/utils";
import { PAGE_SIZE_OPTIONS, pageWindow } from "@/shared/lib/pagination";

// The pagination bar for data tables.
//
// An operational list is not a feed. "Load more" is right for a timeline you
// scroll until bored; it is wrong for a dataset where the questions are "how
// many are there", "am I near the end", and "take me back to where I was".
//
// TWO MODES, and which one you get is decided by the SERVER, not by taste:
//
//   • `total` known   → range, denominator, and numbered pages with an
//                       ellipsis window. The full enterprise control.
//   • `total` null    → range and Previous/Next only, with the current page
//                       number. The denominator is omitted rather than
//                       guessed.
//
// The second mode exists because `/api/issues` paginates by CURSOR: it can
// answer "is there another page" for free (it fetches take+1) but it never
// counts the matching set, and nothing addresses a page by number. Rendering
// "1–50 of 7,300" there would mean fetching all 7,300 rows into the browser to
// count them — which is not pagination, it is pagination-shaped theatre. When
// the API grows a count, this component already renders the full control; the
// only change is a prop that stops being null.

export interface PaginationProps {
  /** 1-based index of the page currently on screen. */
  page: number;
  pageSize: number;
  /** Rows on THIS page — the range's width, which the last page shortens. */
  count: number;
  /** Total matching rows, or `null` when the server cannot answer it. */
  total?: number | null;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** Jump to an absolute page. Offered only when `total` is known. */
  onPage?: (page: number) => void;
  onPageSize: (size: number) => void;
  pageSizeOptions?: readonly number[];
  /** Disables navigation while a request is in flight. */
  busy?: boolean;
  className?: string;
}

const NUMBERS = new Intl.NumberFormat();

export function Pagination({
  page,
  pageSize,
  count,
  total = null,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onPage,
  onPageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  busy = false,
  className,
}: PaginationProps) {
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = count === 0 ? 0 : from + count - 1;
  const pageCount = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const numbered = pageCount !== null && onPage !== undefined;

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex h-toolbar shrink-0 items-center gap-4 border-t border-border bg-surface-sunken px-4",
        className,
      )}
    >
      <label className="flex items-center gap-2 text-meta text-muted-foreground">
        Rows per page
        <Select
          value={String(pageSize)}
          onValueChange={(value) => onPageSize(Number(value))}
        >
          <SelectTrigger aria-label="Rows per page" className="h-ctl-lg w-auto min-w-0 gap-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>

      {/* `aria-live` because paging replaces the rows without moving focus; a
          screen-reader user otherwise gets no confirmation that anything
          happened. */}
      <p className="text-meta tabular-nums text-muted-foreground" aria-live="polite">
        {count === 0 ? (
          "No results"
        ) : (
          <>
            <span className="font-medium text-foreground">
              {NUMBERS.format(from)}–{NUMBERS.format(to)}
            </span>
            {total !== null && <> of {NUMBERS.format(total)}</>}
          </>
        )}
      </p>

      <div className="ml-auto flex items-center gap-1">
        <Step
          label="Previous page"
          onClick={onPrev}
          disabled={!hasPrev || busy}
          icon={<ChevronLeft className="size-4" />}
        />

        {numbered ? (
          pageWindow(page, pageCount).map((n, i) =>
            n === null ? (
              <span key={`gap-${i}`} className="px-1 text-meta text-muted-foreground" aria-hidden>
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onPage(n)}
                disabled={busy}
                aria-label={`Page ${n}`}
                aria-current={n === page ? "page" : undefined}
                className={cn(
                  "h-ctl-lg min-w-[2rem] rounded-control px-2 text-meta tabular-nums transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                  n === page
                    ? "bg-accent font-semibold text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {n}
              </button>
            ),
          )
        ) : (
          // No denominator, so the page number is stated rather than offered as
          // a jump target: a "3" you cannot click to leave is a label.
          <span className="px-2 text-meta tabular-nums text-muted-foreground">
            Page <span className="font-medium text-foreground">{page}</span>
          </span>
        )}

        <Step
          label="Next page"
          onClick={onNext}
          disabled={!hasNext || busy}
          icon={<ChevronRight className="size-4" />}
        />
      </div>
    </nav>
  );
}

function Step({
  label,
  onClick,
  disabled,
  icon,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "flex size-8 items-center justify-center rounded-control border border-border bg-background text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        // Not hidden when unavailable: a control that disappears at the first
        // page moves everything beside it, and the reader loses the shape of
        // the bar they just learned.
        "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground",
      )}
    >
      {icon}
    </button>
  );
}
