"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { WidgetCard, widgetSpanClass } from "@/features/dashboards/components/widget-card";
import type {
  DashboardWidgetDto,
  WidgetDataDto,
} from "@/features/dashboards/types/dashboard.types";

// A widget that can be dragged into a new position.
//
// The grip is the handle, not the whole card — unlike a backlog row, a widget
// is full of links (an issue, "Open"), and making the card itself draggable
// would swallow every one of them.
export function SortableWidget({
  widget,
  data,
  editing,
  onEdit,
}: {
  widget: DashboardWidgetDto;
  data: WidgetDataDto | undefined;
  editing: boolean;
  onEdit: () => void;
}) {
  const sortable = useSortable({ id: widget.id, disabled: !editing });

  // The wrapper is the grid's direct child, so the column span belongs here;
  // `display: contents` would drop the very box dnd-kit needs to transform.
  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
      }}
      className={cn("min-w-0", widgetSpanClass(widget.width))}
    >
      <WidgetCard
        widget={widget}
        data={data}
        editing={editing}
        onEdit={onEdit}
        className={cn(sortable.isDragging && "opacity-50 ring-1 ring-accent")}
        dragHandle={
          editing ? (
            <button
              type="button"
              aria-label={`Reorder ${widget.title}`}
              {...sortable.attributes}
              {...sortable.listeners}
              className="-ml-1 cursor-grab touch-none rounded-lg p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          ) : null
        }
      />
    </div>
  );
}
