"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/shared/lib/utils";
import { StatusSwatch } from "@/features/workflow/components/status-swatch";
import type { WorkflowStatusDto } from "@/features/workflow/types/workflow.types";
import { BoardCard } from "./board-card";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// One status column. It's a droppable so a card can be dropped onto an empty
// column (where there is no card to drop onto), and a SortableContext so cards
// reorder within it. `count` is the filtered total (may exceed the capped list).
export function BoardColumn({
  projectId,
  status,
  items,
  count,
  canWrite,
}: {
  projectId: string;
  status: WorkflowStatusDto;
  items: IssueListItemDto[];
  count: number;
  canWrite: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDroppableId(status.id) });

  return (
    // A white column containing a recessed well, so the stack reads as three
    // depths: tinted canvas → white column → grey well with raised cards in it.
    // The column was `bg-surface/50` — within a percent of the new canvas
    // colour, so on a tinted page the columns simply disappeared and the board
    // became four floating stacks of cards.
    <div className="flex min-w-0 flex-col rounded-2xl border border-border bg-background p-2 shadow-card">
      <div className="mb-2 flex items-center gap-2 px-2 pt-1">
        <StatusSwatch color={status.color} />
        <h2 className="text-[13px] font-semibold text-foreground">{status.name}</h2>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-xl bg-muted/50 p-2 transition-colors",
          isOver && "bg-accent/10 ring-1 ring-inset ring-accent/40",
        )}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {items.map((item) => (
            <BoardCard
              key={item.id}
              projectId={projectId}
              item={item}
              canWrite={canWrite}
            />
          ))}
        </SortableContext>
        {items.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            No issues
          </p>
        )}
      </div>
    </div>
  );
}

// Column droppable ids are namespaced so they never collide with card ids.
export const COLUMN_DROP_PREFIX = "col:";
/** Droppable id for a column. Keyed by STATUS ID (30_workflow BR-5). */
export function columnDroppableId(statusId: string): string {
  return `${COLUMN_DROP_PREFIX}${statusId}`;
}
