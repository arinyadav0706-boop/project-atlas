"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import {
  barBox,
  daysBetween,
  DRAG_THRESHOLD_PX,
  resolveDrag,
  type Axis,
  type DragMode,
  type DragShift,
  type Span,
} from "@/features/timeline/lib/scale";
import type { TimelineRowDto } from "@/features/timeline/types/timeline.types";

// One bar, and the drag that moves it (ADR-0047 §8).
//
// Pointer events and a pixels-per-day constant, not dnd-kit: dnd-kit sorts
// lists, and this is free positioning against a scale where the whole job is
// translating a pixel offset into a date. Pointer capture means a fast drag
// that outruns the cursor still ends on this element rather than being lost.
//
// The live gesture lives in a ref, and only the *preview* lives in state
// (BR-15). React state is for painting; it is not a reliable record of what
// the hand just did, because the pointerup handler can run against a render
// that has not caught up. The ref is written synchronously on every move, so
// the decision made on release is always about the gesture that actually
// happened.

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
  // re-render on every pointer move — only this bar does. This is the PAINT
  // copy; the ref below is the record of record.
  const [preview, setPreview] = useState<DragShift | null>(null);
  const drag = useRef<{
    mode: DragMode;
    originX: number;
    /** Has the pointer travelled far enough for this to be a drag, not a click? */
    moved: boolean;
    shift: DragShift;
  } | null>(null);

  // BR-6: a rolled-up epic is computed from its children, so there is nothing
  // here to drag. Read-only, and drawn differently so that is visible.
  const draggable = canEdit && !row.rolledUp;

  const onPointerDown = useCallback(
    (mode: DragMode) => (e: React.PointerEvent) => {
      if (!draggable) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      drag.current = { mode, originX: e.clientX, moved: false, shift: { start: 0, end: 0 } };
      // Deliberately no setPreview here: a press that turns out to be a click
      // should not cost a render, and `preview` staying null is what tells the
      // bar it is not currently being dragged.
    },
    [draggable],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      const dx = e.clientX - state.originX;
      // Below the threshold this is still a click in progress — hands shake,
      // and a 2px tremor must not turn a click into a no-op drag.
      if (!state.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      state.moved = true;
      state.shift = resolveDrag(state.mode, dx, axis.pxPerDay, daysBetween(span.start, span.end));
      setPreview(state.shift);
    },
    [axis.pxPerDay, span],
  );

  const endGesture = useCallback(
    (e: React.PointerEvent) => {
      const state = drag.current;
      if (!state) return null;
      drag.current = null;
      setPreview(null);
      const el = e.currentTarget as HTMLElement;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      return state;
    },
    [],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const state = endGesture(e);
      if (!state) return;
      // The pointer never really moved: that is a click, and a click opens the
      // issue. Decided on distance travelled, NOT on whether the dates ended up
      // different — a drag that resolves to zero days (too short at this zoom,
      // or an edge clamped at one day) is still a drag, and the one thing it
      // must not do is navigate away from the chart.
      if (!state.moved) {
        onSelect(row);
        return;
      }
      if (state.shift.start === 0 && state.shift.end === 0) return;
      onCommit(row, state.shift.start, state.shift.end);
    },
    [endGesture, row, onCommit, onSelect],
  );

  // A cancelled pointer (the browser taking over for a scroll, a device
  // disconnecting) abandons the gesture: no commit, no navigation.
  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      endGesture(e);
    },
    [endGesture],
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
      onPointerCancel={onPointerCancel}
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
            onPointerCancel={onPointerCancel}
            className="absolute -left-1 top-0 h-full w-2 cursor-ew-resize rounded-l-md bg-black/0 transition-colors hover:bg-black/25 group-hover/bar:bg-black/15"
            aria-hidden
          />
          <span
            onPointerDown={onPointerDown("end")}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
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
