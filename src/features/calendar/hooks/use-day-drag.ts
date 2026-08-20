"use client";

import { useCallback, useRef, useState } from "react";
import { DRAG_THRESHOLD_PX } from "@/features/timeline/lib/scale";

// Dragging something onto a day (ADR-0048 §6).
//
// Pointer events, not HTML5 drag-and-drop: HTML5 DnD cannot style a drag image
// usefully, fires nothing useful on touch, and is close to untestable with a
// real mouse — and the last two Timeline bugs both got through because a drag
// was only ever verified through the API rather than by moving a pointer.
//
// The click-vs-drag rule is the Timeline's, deliberately (29_calendar BR-14 =
// 28_timeline BR-15): distance travelled decides, measured in pixels, and the
// live gesture lives in a ref rather than in state because the release handler
// must reason about what the hand did, not about what has finished rendering.

export interface DragPayload {
  /** The issue being dragged. */
  id: string;
  /**
   * Which day of the item's own span sits under the cursor at grab time, as an
   * offset from its start. Dropping preserves it, so a bar grabbed by its
   * Wednesday lands with its Wednesday on the target — the way every calendar
   * behaves. Zero for a one-day event or a panel row.
   */
  grabOffsetDays: number;
}

interface DragState extends DragPayload {
  originX: number;
  originY: number;
  moved: boolean;
  /** `YYYY-MM-DD` of the cell under the pointer, or null when outside the grid. */
  overDay: string | null;
}

/** The day cell under a viewport point, read from `data-day` in the DOM. */
function dayAtPoint(x: number, y: number): string | null {
  // `elementsFromPoint` (plural) so a bar or the floating ghost lying over the
  // cell does not hide it. Cheaper and more predictable than toggling
  // pointer-events on every bar for the duration of a drag.
  for (const el of document.elementsFromPoint(x, y)) {
    const day = (el as HTMLElement).dataset?.day;
    if (day) return day;
  }
  return null;
}

export function useDayDrag({
  onDrop,
  onClick,
}: {
  /** A completed drag onto a day. Not called when the drop misses the grid. */
  onDrop: (payload: DragPayload, day: string) => void;
  /** The pointer never travelled — that is a click, not a tiny drag. */
  onClick: (payload: DragPayload) => void;
}) {
  const state = useRef<DragState | null>(null);
  // Paint-only. The ref above is the record of record.
  const [preview, setPreview] = useState<{
    id: string;
    overDay: string | null;
    x: number;
    y: number;
  } | null>(null);

  const onPointerDown = useCallback(
    (payload: DragPayload) => (e: React.PointerEvent) => {
      // Left button only: a right-click that begins a drag steals the context
      // menu and drops the issue somewhere nobody asked for.
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      state.current = {
        ...payload,
        originX: e.clientX,
        originY: e.clientY,
        moved: false,
        overDay: null,
      };
    },
    [],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const s = state.current;
    if (!s) return;
    if (
      !s.moved &&
      Math.abs(e.clientX - s.originX) < DRAG_THRESHOLD_PX &&
      Math.abs(e.clientY - s.originY) < DRAG_THRESHOLD_PX
    ) {
      return;
    }
    s.moved = true;
    s.overDay = dayAtPoint(e.clientX, e.clientY);
    setPreview({ id: s.id, overDay: s.overDay, x: e.clientX, y: e.clientY });
  }, []);

  const finish = useCallback((e: React.PointerEvent) => {
    const s = state.current;
    if (!s) return null;
    state.current = null;
    setPreview(null);
    const el = e.currentTarget as HTMLElement;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    return s;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const s = finish(e);
      if (!s) return;
      if (!s.moved) {
        onClick({ id: s.id, grabOffsetDays: s.grabOffsetDays });
        return;
      }
      // A drag that ends outside the grid does nothing. Snapping it to the
      // nearest cell would reschedule work because somebody let go over the
      // sidebar.
      if (!s.overDay) return;
      onDrop({ id: s.id, grabOffsetDays: s.grabOffsetDays }, s.overDay);
    },
    [finish, onDrop, onClick],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      finish(e);
    },
    [finish],
  );

  return {
    /** Spread onto anything draggable, with the payload it carries. */
    handlers: (payload: DragPayload) => ({
      onPointerDown: onPointerDown(payload),
      onPointerMove,
      onPointerUp,
      onPointerCancel,
    }),
    /** Null unless a drag is actually in flight. */
    preview,
  };
}
