"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { StatusDot } from "@/features/issues/components/issue-meta";
import { addDays, daysBetween, spanOf, toDayString } from "@/shared/lib/day";
import {
  buildCalendar,
  DAYS_PER_WEEK,
  type CalendarWeek,
} from "@/features/calendar/lib/grid";
import type { DragPayload } from "@/features/calendar/hooks/use-day-drag";
import type { CalendarEventDto } from "@/features/calendar/types/calendar.types";

// The grid (29_calendar.md §5).
//
// Bars are absolutely positioned over a seven-column week row rather than
// placed inside day cells: a multi-day bar has to cross cell boundaries, and a
// bar that lives inside one cell can only ever be one day wide (BR-3).

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Bar height plus its gap. Lanes stack by this. */
const LANE_H = 22;
/** Room above the bars for the day number. */
const HEADER_H = 26;

const STATUS_BAR: Record<string, string> = {
  TODO: "bg-slate-400/90 hover:bg-slate-400",
  IN_PROGRESS: "bg-sky-500/90 hover:bg-sky-500",
  IN_REVIEW: "bg-amber-500/90 hover:bg-amber-500",
  DONE: "bg-emerald-500/90 hover:bg-emerald-500",
};

const PRIORITY_DOT: Record<string, string> = {
  HIGHEST: "bg-rose-200",
  HIGH: "bg-orange-200",
  MEDIUM: "bg-amber-100",
  LOW: "bg-sky-100",
  LOWEST: "bg-white/50",
};

export function CalendarGrid({
  events,
  from,
  to,
  monthAnchor,
  today,
  canEdit,
  maxLanes,
  dragHandlers,
  draggingId,
  overDay,
  onOpenDay,
}: {
  events: CalendarEventDto[];
  from: Date;
  to: Date;
  /** Which month is "this" one — days outside it are dimmed. Null in week view. */
  monthAnchor: Date | null;
  today: Date;
  canEdit: boolean;
  /** Bars per cell before the rest become "+N more" — month and week differ. */
  maxLanes: number;
  dragHandlers: (payload: DragPayload) => Record<string, unknown>;
  draggingId: string | null;
  overDay: string | null;
  onOpenDay: (day: string) => void;
}) {
  const weeks = buildCalendar(events, from, to, maxLanes);
  const todayKey = toDayString(today);
  const anchorMonth = monthAnchor?.getUTCMonth();

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-muted/40">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {d}
          </div>
        ))}
      </div>

      {weeks.map((week) => (
        <WeekRow
          key={toDayString(week.row.start)}
          week={week}
          todayKey={todayKey}
          anchorMonth={anchorMonth}
          canEdit={canEdit}
          maxLanes={maxLanes}
          dragHandlers={dragHandlers}
          draggingId={draggingId}
          overDay={overDay}
          onOpenDay={onOpenDay}
          single={weeks.length === 1}
        />
      ))}
    </div>
  );
}

function WeekRow({
  week,
  todayKey,
  anchorMonth,
  canEdit,
  maxLanes,
  dragHandlers,
  draggingId,
  overDay,
  onOpenDay,
  single,
}: {
  week: CalendarWeek<CalendarEventDto>;
  todayKey: string;
  anchorMonth: number | undefined;
  canEdit: boolean;
  maxLanes: number;
  dragHandlers: (payload: DragPayload) => Record<string, unknown>;
  draggingId: string | null;
  overDay: string | null;
  onOpenDay: (day: string) => void;
  single: boolean;
}) {
  // Size to what is actually in the row, not to the cap: an empty week must
  // not reserve four lanes of blank space.
  const lanes = Math.min(maxLanes, Math.max(1, ...week.segments.map((s) => s.lane + 1)));
  const hasOverflow = week.overflow.some((n) => n > 0);
  const content = HEADER_H + lanes * LANE_H + (hasOverflow ? 20 : 6);
  // The week view draws ONE row, so it gets the page's height rather than a
  // month row's — an 80px strip alone on a tall page reads as broken.
  const minHeight = single ? Math.max(460, content) : Math.max(112, content);

  return (
    <div
      className="relative grid grid-cols-7 border-b border-border last:border-b-0"
      style={{ minHeight }}
    >
      {week.row.days.map((day, col) => {
        const key = toDayString(day);
        const isToday = key === todayKey;
        const outside = anchorMonth !== undefined && day.getUTCMonth() !== anchorMonth;
        const weekend = col >= 5;
        const more = week.overflow[col] ?? 0;

        return (
          <div
            key={key}
            // The drop target (ADR-0048 §6). `data-day` is what the drag hook
            // hit-tests for — a discrete cell, which is exactly why this gesture
            // is offered here and refused on the Timeline's continuous axis.
            data-day={key}
            className={cn(
              "relative min-w-0 border-r border-border/70 last:border-r-0 transition-colors",
              weekend && "bg-muted/25",
              outside && "bg-muted/40",
              overDay === key && "bg-accent/10 ring-1 ring-inset ring-accent",
            )}
          >
            <div className="pointer-events-none flex items-start justify-between px-1.5 pt-1.5">
              <span
                className={cn(
                  "flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 text-[11px] font-medium tabular-nums",
                  isToday && "bg-accent font-semibold text-accent-foreground",
                  !isToday && outside && "text-muted-foreground/50",
                  !isToday && !outside && "text-foreground",
                )}
              >
                {day.getUTCDate()}
              </span>
            </div>

            {more > 0 && (
              <button
                type="button"
                onClick={() => onOpenDay(key)}
                className="absolute left-1 right-1 rounded px-1 py-0.5 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                style={{ top: HEADER_H + lanes * LANE_H + 2 }}
              >
                +{more} more
              </button>
            )}
          </div>
        );
      })}

      {/* Bars float over the cells so they can span them. The layer ignores the
          pointer; each bar re-enables it, so a drop still hit-tests the cell
          underneath rather than the annotation on top of it.

          Offset with `top`, NOT with padding: an absolutely positioned child is
          placed against its container's PADDING box, so `paddingTop` here moves
          nothing and every bar lands on top of the day numbers. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0" style={{ top: HEADER_H }}>
        {week.segments.map((seg) => (
          <EventBar
            key={`${seg.item.id}:${toDayString(week.row.start)}`}
            event={seg.item}
            startCol={seg.startCol}
            length={seg.length}
            lane={seg.lane}
            continuesBefore={seg.continuesBefore}
            continuesAfter={seg.continuesAfter}
            weekStart={week.row.start}
            canEdit={canEdit}
            dragging={draggingId === seg.item.id}
            dragHandlers={dragHandlers}
          />
        ))}
      </div>
    </div>
  );
}

function EventBar({
  event,
  startCol,
  length,
  lane,
  continuesBefore,
  continuesAfter,
  weekStart,
  canEdit,
  dragging,
  dragHandlers,
}: {
  event: CalendarEventDto;
  startCol: number;
  length: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  weekStart: Date;
  canEdit: boolean;
  dragging: boolean;
  dragHandlers: (payload: DragPayload) => Record<string, unknown>;
}) {
  const span = spanOf(event);
  // Which day of the event the grab landed on, so a drop puts that same day
  // under the cursor. Measured from the segment's first visible column, which
  // is where the pointer necessarily is for a bar cut by a week boundary.
  const grabOffsetDays = span ? daysBetween(span.start, addDays(weekStart, startCol)) : 0;

  const pct = (n: number) => `calc(${(n / DAYS_PER_WEEK) * 100}% + ${n === 0 ? 3 : 2}px)`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${event.key} ${event.title}`}
      data-event-key={event.key}
      {...(canEdit ? dragHandlers({ id: event.id, grabOffsetDays }) : {})}
      className={cn(
        "pointer-events-auto absolute flex h-[18px] items-center gap-1 overflow-hidden px-1.5 text-[11px] text-white shadow-sm transition-[opacity,box-shadow]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        STATUS_BAR[event.status] ?? "bg-slate-400",
        // Square off the cut end so a bar that continues does not look like it
        // finishes on Sunday.
        continuesBefore ? "rounded-l-none" : "rounded-l",
        continuesAfter ? "rounded-r-none" : "rounded-r",
        canEdit && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
        event.status === "DONE" && "opacity-75",
      )}
      style={{
        left: pct(startCol),
        width: `calc(${(length / DAYS_PER_WEEK) * 100}% - 5px)`,
        top: lane * LANE_H,
      }}
      title={`${event.key} · ${event.title}`}
    >
      {continuesBefore && <ChevronLeft className="h-3 w-3 shrink-0 opacity-80" />}
      <span
        className={cn(
          "h-1.5 w-1.5 shrink-0 rounded-full",
          PRIORITY_DOT[event.priority] ?? "bg-white/50",
        )}
        aria-hidden
      />
      <span className={cn("truncate", event.status === "DONE" && "line-through")}>
        <span className="font-medium tabular-nums opacity-80">{event.key}</span>{" "}
        {event.title}
      </span>
      {continuesAfter && <ChevronRight className="ml-auto h-3 w-3 shrink-0 opacity-80" />}
    </div>
  );
}

/** The same pill, for the "+N more" list and the drag ghost. */
export function EventChip({ event }: { event: CalendarEventDto }) {
  return (
    <span className="flex items-center gap-1.5 truncate rounded-md border border-border bg-background px-2 py-1 text-[12px] shadow-pop">
      <StatusDot status={event.status} />
      <span className="font-medium tabular-nums text-muted-foreground">{event.key}</span>
      <span className="truncate">{event.title}</span>
    </span>
  );
}
