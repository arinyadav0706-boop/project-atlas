"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { HomeSection } from "@/features/home/components/home-section";

// A Home panel that shows the first few rows and reveals the rest in place.
//
// For lists that have no page of their own to link to (Upcoming, Continue
// working, Recent activity): the rows are already on the page, so "View all"
// opens them here rather than fetching or inventing a destination. Short
// panels are what keep a row of side-by-side panels the same height.
export function ExpandableSection({
  title,
  initial,
  rows,
  tabs,
  listClassName,
  className,
}: {
  title: string;
  /** Rows shown while collapsed. */
  initial: number;
  /** Rendered `<li>`s, keyed by the caller. */
  rows: React.ReactNode[];
  tabs?: React.ReactNode;
  listClassName?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const listId = React.useId();
  const hidden = rows.length - initial;
  return (
    <HomeSection
      title={title}
      tabs={tabs}
      className={className}
      action={
        hidden > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-chip text-[12px] font-medium text-accent transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {open ? "Show less" : `View all ${rows.length}`}
            <ChevronDown className={open ? "size-3.5 rotate-180" : "size-3.5"} />
          </button>
        ) : undefined
      }
    >
      <ul id={listId} className={listClassName}>
        {open ? rows : rows.slice(0, initial)}
      </ul>
    </HomeSection>
  );
}
