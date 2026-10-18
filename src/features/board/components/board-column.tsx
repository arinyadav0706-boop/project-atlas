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
    <div className="flex h-[calc(100vh-250px)] min-h-[480px] w-[320px] shrink-0 flex-col rounded-3xl border border-border/60 bg-surface-sunken/70 shadow-2xs backdrop-blur-sm">
      {/* Column Header */}
      <div className="flex shrink-0 items-center justify-between gap-2.5 border-b border-border-subtle/70 px-4 py-3.5 bg-surface/60 rounded-t-3xl">
        <div className="flex items-center gap-2.5 min-w-0">
          <StatusSwatch color={status.color} />
          <h2 className="truncate text-[13px] font-bold tracking-tight text-foreground">
            {status.name}
          </h2>
        </div>
        <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-xs font-bold tabular-nums text-primary shadow-2xs ring-1 ring-border/60">
          {count}
        </span>
      </div>

      {/* Droppable Scrollable Card Lane */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-3 transition-all",
          isOver && "bg-primary/8 ring-2 ring-primary/35 ring-inset rounded-b-3xl"
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
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-border/60 m-1 py-12 text-center text-xs font-medium text-muted-foreground/70">
            Drop issues into {status.name}
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
