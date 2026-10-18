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
    <div className="flex min-w-[270px] max-w-[340px] flex-1 flex-col rounded-lg border border-border bg-surface-sunken/70 p-2 shadow-2xs">
      {/* Column Header */}
      <div className="mb-2 flex items-center gap-2 px-2 py-1">
        <StatusSwatch color={status.color} />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
          {status.name}
        </h2>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      </div>

      {/* Droppable Card Lane */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[300px] flex-1 flex-col gap-2 rounded-md p-1.5 transition-colors",
          isOver && "bg-primary/10 ring-2 ring-primary/40"
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
      </div>
    </div>
  );
}

export const COLUMN_DROP_PREFIX = "column:";

export function columnDroppableId(statusId: string): string {
  return `${COLUMN_DROP_PREFIX}${statusId}`;
}
