"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Loader2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { StatusSwatch } from "@/features/workflow/components/status-swatch";
import type { WorkflowStatusDto } from "@/features/workflow/types/workflow.types";
import { BoardCard } from "./board-card";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// One status column.
//
// It is a droppable so a card can land on an EMPTY column (where there is no
// card to drop onto), and a SortableContext so cards reorder within it.
//
// The column owns its own scrolling. Previously the whole board scrolled as one
// document, so a long To Do column pushed every other column's cards off screen
// and you scrolled past 40 cards you did not care about to see whether Done had
// anything in it. Now each column scrolls independently inside a fixed-height
// board — which is what Jira, ClickUp, Linear and Trello all do, for this
// reason.

const NUMBERS = new Intl.NumberFormat();

export function BoardColumn({
  projectId,
  status,
  items,
  count,
  canWrite,
  hasMore,
  loadingMore = false,
  onLoadMore,
}: {
  projectId: string;
  status: WorkflowStatusDto;
  items: IssueListItemDto[];
  /** Live total under the active filter — may exceed what is loaded. */
  count: number;
  canWrite: boolean;
  hasMore: boolean;
  loadingMore?: boolean;
  onLoadMore: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDroppableId(status.id) });

  return (
    <section
      aria-label={`${status.name} column`}
      className="flex h-full min-h-0 min-w-0 flex-col rounded-panel border border-border bg-surface-sunken"
    >
      {/* Sticky within the column, not within the page: scroll a column of 200
          cards and you must still be able to see which column it is. */}
      <header className="flex h-col-head shrink-0 items-center gap-2 border-b border-border-subtle px-3">
        <StatusSwatch color={status.color} />
        <h2 className="min-w-0 truncate text-label uppercase tracking-wide text-muted-foreground">
          {status.name}
        </h2>
        <span className="ml-auto shrink-0 rounded-chip bg-muted px-1.5 text-meta font-medium tabular-nums text-muted-foreground">
          {NUMBERS.format(count)}
        </span>
      </header>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 transition-colors",
          isOver && "bg-accent/[0.07] ring-1 ring-inset ring-accent/40",
        )}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <BoardCard key={item.id} projectId={projectId} item={item} canWrite={canWrite} />
          ))}
        </SortableContext>

        {items.length === 0 && (
          <p className="px-1 py-8 text-center text-meta text-muted-foreground">
            Nothing here
          </p>
        )}

        {/* The fix for UX-5. A column used to stop at 100 cards with no way to
            reach card 101, while its own header counted 137 — a number the
            reader had no way to reconcile with the list under it. */}
        {hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className={cn(
              "flex h-ctl-lg shrink-0 items-center justify-center gap-1.5 rounded-control border border-dashed border-border",
              "text-meta font-medium text-muted-foreground transition-colors",
              "hover:border-border-strong hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
              "disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {loadingMore && <Loader2 className="size-3.5 animate-spin" />}
            {/* Says how many are still hidden, not just "more" — the whole
                point of the count is that the reader can act on it. */}
            Load {NUMBERS.format(Math.max(count - items.length, 0))} more
          </button>
        )}
      </div>
    </section>
  );
}

// Column droppable ids are namespaced so they never collide with card ids.
export const COLUMN_DROP_PREFIX = "col:";
/** Droppable id for a column. Keyed by STATUS ID (30_workflow BR-5). */
export function columnDroppableId(statusId: string): string {
  return `${COLUMN_DROP_PREFIX}${statusId}`;
}
