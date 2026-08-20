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
const LANE_H = 23;
/** Room above the bars for the day number. */
const HEADER_H = 30;

/**
 * A bar is a TINTED PILL with a colour accent, not a saturated block.
 *
 * The first version filled each bar with a solid status colour and white text.
 * On real data — where most issues run about a week — that turns a month into
 * horizontal stripes: the gridlines vanish behind the fill, every row shouts at
 * the same volume, and you cannot tell Tuesday from Thursday. A calendar's
 * background has to stay legible for the dates to mean anything.
 *
 * So: a pale wash, a 3px accent on the leading edge, and normal foreground
 * text. Colour still carries status, but as a mark rather than a floodlight —
 * the same reason Design Principles §2 pairs colour with a shape and never
 * lets it do the work alone.
 */
const STATUS_BAR: Record<string, string> = {
  TODO: "bg-slate-500/[0.08] hover:bg-slate-500/[0.16] border-l-slate-400",
  IN_PROGRESS: "bg-sky-500/[0.10] hover:bg-sky-500/[0.18] border-l-sky-500",
  IN_REVIEW: "bg-amber-500/[0.12] hover:bg-amber-500/[0.20] border-l-amber-500",
  DONE: "bg-emerald-500/[0.08] hover:bg-emerald-500/[0.16] border-l-emerald-500",
};

/** Only the two priorities worth interrupting for get a mark at this size. */
const PRIORITY_DOT: Record<string, string> = {
  HIGHEST: "bg-rose-500",
  HIGH: "bg-orange-500",
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
      <div className="grid grid-cols-7 border-b border-border bg-muted/30">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2.5 py-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground/80"
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
  const content = HEADER_H + lanes * LANE_H + (hasOverflow ? 22 : 8);
  // The week view draws ONE row, so it gets the page's height rather than a
  // month row's — an 80px strip alone on a tall page reads as broken.
  const minHeight = single ? Math.max(460, content) : Math.max(124, content);

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
              "relative min-w-0 border-r border-border/50 last:border-r-0 transition-colors",
              weekend && "bg-muted/20",
              outside && "bg-muted/35",
              overDay === key && "bg-accent/10 ring-1 ring-inset ring-accent",
            )}
          >
            <div className="pointer-events-none flex items-start px-1.5 pt-1.5">
              <span
                className={cn(
                  "flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-1 text-[11px] tabular-nums",
                  isToday && "bg-accent font-semibold text-accent-foreground",
                  !isToday && outside && "text-muted-foreground/45",
                  !isToday && !outside && "font-medium text-muted-foreground",
                )}
              >
                {day.getUTCDate()}
              </span>
            </div>

            {more > 0 && (
              <button
                type="button"
                onClick={() => onOpenDay(key)}
                className="absolute left-1 right-1 rounded px-1.5 py-0.5 text-left text-[11px] text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                style={{ top: HEADER_H + lanes * LANE_H + 1 }}
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

  // A 4px gutter each side so the cell borders stay visible between bars —
  // edge-to-edge fills are what made the grid disappear.
  const pct = (n: number) => `calc(${(n / DAYS_PER_WEEK) * 100}% + 4px)`;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${event.key} ${event.title}`}
      data-event-key={event.key}
      {...(canEdit ? dragHandlers({ id: event.id, grabOffsetDays }) : {})}
      className={cn(
        "pointer-events-auto absolute flex h-[19px] items-center gap-1.5 overflow-hidden rounded-[4px] border-l-[3px] pl-1.5 pr-1.5 text-[11px] leading-none text-foreground transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        STATUS_BAR[event.status] ?? STATUS_BAR.TODO,
        // Square off the cut end, and drop the accent there — an accent in the
        // middle of a continued bar reads as a second task starting.
        continuesBefore && "rounded-l-none border-l-0 pl-2",
        continuesAfter && "rounded-r-none",
        canEdit && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
        event.status === "DONE" && "text-muted-foreground",
      )}
      style={{
        left: pct(startCol),
        width: `calc(${(length / DAYS_PER_WEEK) * 100}% - 8px)`,
        top: lane * LANE_H,
      }}
      title={`${event.key} · ${event.title}`}
    >
      {continuesBefore && (
        <ChevronLeft className="h-3 w-3 shrink-0 text-muted-foreground/70" />
      )}
      {/* Only HIGHEST and HIGH get a dot. A mark on every bar is not a signal,
          it is texture — and five priority colours at 6px is unreadable anyway. */}
      {PRIORITY_DOT[event.priority] && (
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", PRIORITY_DOT[event.priority])}
          aria-hidden
        />
      )}
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {event.key}
      </span>
      <span className={cn("truncate", event.status === "DONE" && "line-through decoration-1")}>
        {event.title}
      </span>
      {continuesAfter && (
        <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-muted-foreground/70" />
      )}
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
