"use client";

import { useState } from "react";
import { CalendarPlus, GripVertical, Inbox } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardHeader } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { cn } from "@/shared/lib/utils";
import { IssueTypeIcon } from "@/features/issues/components/issue-meta";
import { toDayString } from "@/shared/lib/day";
import type { DragPayload } from "@/features/calendar/hooks/use-day-drag";
import type { CalendarEventDto } from "@/features/calendar/types/calendar.types";

// Undated issues, and the two ways onto the grid (BR-7).
//
// Dragging a row onto a day is the natural gesture and it ships here — a day
// cell is a discrete drop target, which is exactly the thing the Timeline's
// continuous axis could not offer (28_timeline BR-12).
//
// The date input beside it is not a lesser fallback, it is the keyboard path:
// a drag-only control is unusable for anyone not using a mouse, and "ships a
// gesture, forgets the keyboard" is how a feature becomes an accessibility
// bug.

export function UnscheduledPanel({
  items,
  canEdit,
  dragHandlers,
  draggingId,
  onSchedule,
}: {
  items: CalendarEventDto[];
  canEdit: boolean;
  dragHandlers: (payload: DragPayload) => Record<string, unknown>;
  draggingId: string | null;
  onSchedule: (event: CalendarEventDto, day: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader
        icon={<Inbox />}
        title={`Unscheduled (${items.length})`}
        action={
          <span className="text-[11px] text-muted-foreground">
            {canEdit ? "Drag onto a day, or pick a date" : "No due date yet"}
          </span>
        }
      />
      <ul className="max-h-[320px] space-y-1 overflow-y-auto px-2 pb-3">
        {items.map((item) => (
          <PanelRow
            key={item.id}
            item={item}
            canEdit={canEdit}
            dragging={draggingId === item.id}
            dragHandlers={dragHandlers}
            onSchedule={onSchedule}
          />
        ))}
      </ul>
    </Card>
  );
}

function PanelRow({
  item,
  canEdit,
  dragging,
  dragHandlers,
  onSchedule,
}: {
  item: CalendarEventDto;
  canEdit: boolean;
  dragging: boolean;
  dragHandlers: (payload: DragPayload) => Record<string, unknown>;
  onSchedule: (event: CalendarEventDto, day: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(() => toDayString(new Date()));

  return (
    <li
      className={cn(
        "rounded-lg border border-transparent px-2 py-1.5 transition-colors hover:border-border hover:bg-muted/40",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-center gap-2">
        {canEdit && (
          <span
            // A panel row has no span of its own, so there is no grab offset:
            // the day you drop on IS the due date (BR-7).
            {...dragHandlers({ id: item.id, grabOffsetDays: 0 })}
            data-unscheduled-key={item.key}
            className="shrink-0 cursor-grab text-muted-foreground/60 transition-colors hover:text-foreground active:cursor-grabbing"
            aria-hidden
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        <IssueTypeIcon type={item.type} className="h-3.5 w-3.5 shrink-0" />
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
          {item.key}
        </span>
        <span className="truncate text-[13px]">{item.title}</span>
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            <span className="sr-only">Schedule {item.key}</span>
          </Button>
        )}
      </div>

      {open && canEdit && (
        <div className="mt-2 flex items-center gap-2 pl-6">
          <Input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
            className="h-8 w-[150px] text-[12px]"
            aria-label={`Due date for ${item.key}`}
          />
          <Button
            size="sm"
            onClick={() => {
              onSchedule(item, day);
              setOpen(false);
            }}
            disabled={!day}
          >
            Schedule
          </Button>
        </div>
      )}
    </li>
  );
}
