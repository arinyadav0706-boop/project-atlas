"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { barBox, daysBetween, type Axis, type Span } from "@/features/timeline/lib/scale";
import type { TimelineRowDto } from "@/features/timeline/types/timeline.types";

// One bar, and the drag that moves it (ADR-0047 §8).
//
// Pointer events and a pixels-per-day constant, not dnd-kit: dnd-kit sorts
// lists, and this is free positioning against a scale where the whole job is
// translating a pixel offset into a date. Pointer capture means a fast drag
// that outruns the cursor still ends on this element rather than being lost.

type DragMode = "move" | "start" | "end";

const STATUS_FILL: Record<string, string> = {
  TODO: "bg-slate-400",
  IN_PROGRESS: "bg-sky-500",
  IN_REVIEW: "bg-amber-500",
  DONE: "bg-emerald-500",
};

export function TimelineBar({
  row,
  span,
  axis,
  canEdit,
  onCommit,
  onSelect,
}: {
  row: TimelineRowDto;
  span: Span;
  axis: Axis;
  canEdit: boolean;
  /** Days to shift each edge. Called once, on release. */
  onCommit: (row: TimelineRowDto, startShift: number, endShift: number) => void;
  onSelect: (row: TimelineRowDto) => void;
}) {
  // Live offsets during a drag, in days. Kept local so the whole chart does not
  // re-render on every pointer move — only this bar does.
  const [preview, setPreview] = useState<{ start: number; end: number } | null>(null);
  const drag = useRef<{ mode: DragMode; originX: number } | null>(null);

  // BR-6: a rolled-up epic is computed from its children, so there is nothing
  // here to drag. Read-only, and drawn differently so that is visible.
  const draggable = canEdit && !row.rolledUp;

  const onPointerDown = useCallback(
    (mode: DragMode) => (e: React.PointerEvent) => {
      if (!draggable) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { mode, originX: e.clientX };
      setPreview({ start: 0, end: 0 });
    },
    [draggable],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      // Snap to whole days (BR-5) — a Gantt with times on it implies a
      // precision nobody is planning to.
      const days = Math.round((e.clientX - state.originX) / axis.pxPerDay);
      if (state.mode === "move") setPreview({ start: days, end: days });
      // An edge can never cross the other one: clamp instead of letting the
      // bar invert, which would send a start-after-due pair the API refuses.
      else if (state.mode === "start") {
        setPreview({ start: Math.min(days, daysBetween(span.start, span.end)), end: 0 });
      } else {
        setPreview({ start: 0, end: Math.max(days, -daysBetween(span.start, span.end)) });
      }
    },
    [axis.pxPerDay, span],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const state = drag.current;
      drag.current = null;
      if (!state || !preview) return;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      setPreview(null);
      // A drag that moved nothing is a click, and a click opens the issue.
      if (preview.start === 0 && preview.end === 0) {
        onSelect(row);
        return;
      }
      onCommit(row, preview.start, preview.end);
    },
    [preview, row, onCommit, onSelect],
  );

  const shown: Span = preview
    ? {
        start: new Date(span.start.getTime() + preview.start * 86_400_000),
        end: new Date(span.end.getTime() + preview.end * 86_400_000),
      }
    : span;
  const box = barBox(axis, shown);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${row.key} ${row.title}`}
      onPointerDown={onPointerDown("move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(row);
        }
      }}
      style={{ left: box.left, width: box.width }}
      className={cn(
        "group/bar absolute top-1.5 flex h-6 items-center rounded-md px-1.5 text-[11px] transition-shadow",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        row.rolledUp
          ? // Outlined, not solid — the visible difference between a date
            // somebody chose and one the chart worked out (BR-6).
            "border border-dashed border-violet-400 bg-violet-400/10 text-violet-700 dark:text-violet-300"
          : cn(STATUS_FILL[row.status] ?? "bg-slate-400", "text-white shadow-card"),
        draggable && "cursor-grab active:cursor-grabbing",
        preview && "z-20 shadow-pop ring-1 ring-accent",
        row.status === "DONE" && !row.rolledUp && "opacity-70",
      )}
      title={`${row.key} · ${row.title}`}
    >
      {/* Resize handles, on EVERY draggable bar.

          These used to be gated behind `width > 28`, which read as a sensible
          guard and was in fact a bug: a one-day bar is 14px at Week and 12px at
          Month, so on real data — where most issues have a due date and no
          start (BR-3) — resizing was impossible at every zoom but Day. The
          floor in `barBox` (MIN_BAR_PX) now guarantees the room, so the gate is
          gone rather than merely lowered.

          4px wide with a -4px inset so the grab area spills just outside the
          bar: at these sizes an edge you must hit exactly is an edge you miss. */}
      {draggable && (
        <>
          <span
            onPointerDown={onPointerDown("start")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute -left-1 top-0 h-full w-2 cursor-ew-resize rounded-l-md bg-black/0 transition-colors hover:bg-black/25 group-hover/bar:bg-black/15"
            aria-hidden
          />
          <span
            onPointerDown={onPointerDown("end")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute -right-1 top-0 h-full w-2 cursor-ew-resize rounded-r-md bg-black/0 transition-colors hover:bg-black/25 group-hover/bar:bg-black/15"
            aria-hidden
          />
        </>
      )}
      <span className="truncate">
        {box.width > 60 ? row.title : box.width > 28 ? row.key : ""}
      </span>
      {row.blockedBy > 0 && box.width > 80 && (
        <span className="ml-auto shrink-0 rounded bg-black/25 px-1 text-[9px]">
          blocked
        </span>
      )}
    </div>
  );
}
