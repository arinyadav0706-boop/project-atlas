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
    <div className="flex h-[calc(100vh-210px)] min-h-[460px] w-[310px] shrink-0 flex-col rounded-xl border border-border/80 bg-surface-sunken/60 shadow-xs backdrop-blur-sm">
      {/* Sticky Column Header */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3.5 py-3 bg-surface/50 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0">
          <StatusSwatch color={status.color} />
          <h2 className="truncate text-xs font-semibold uppercase tracking-wider text-foreground">
            {status.name}
          </h2>
        </div>
        <span className="shrink-0 rounded-full border border-border/60 bg-muted/70 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>

      {/* Droppable Scrollable Card Lane */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-2 overflow-y-auto overflow-x-hidden p-2 transition-colors custom-scrollbar",
          isOver && "bg-primary/10 ring-2 ring-primary/40 ring-inset rounded-b-xl"
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
          <div className="flex flex-1 items-center justify-center py-12 text-center text-xs text-muted-foreground/60">
            No issues in {status.name}
          </div>
        )}
      </div>
    </div>
  );
}

export const COLUMN_DROP_PREFIX = "column:";

export function columnDroppableId(statusId: string): string {
  return `${COLUMN_DROP_PREFIX}${statusId}`;
}
