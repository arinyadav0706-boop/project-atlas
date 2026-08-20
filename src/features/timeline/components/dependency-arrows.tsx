"use client";

import { barBox, type Axis, type Span } from "@/features/timeline/lib/scale";
import type { TimelineLinkDto } from "@/features/timeline/types/timeline.types";

// Dependency arrows (BR-7/BR-8), as one SVG overlay across the whole grid.
//
// SVG because a path between two boxes is exactly what SVG is for, and one
// overlay rather than a fragment per row because an arrow's whole job is to
// cross rows. `pointer-events-none` throughout: the arrows are annotation, and
// a line lying across a bar must never eat the drag.

const ROW_H = 36;
/** Where a bar's vertical centre sits inside its row. */
const BAR_MID = 15;

export function DependencyArrows({
  links,
  spanById,
  rowIndexById,
  axis,
  height,
}: {
  links: TimelineLinkDto[];
  spanById: Map<string, Span>;
  rowIndexById: Map<string, number>;
  axis: Axis;
  height: number;
}) {
  const paths = links
    .map((link) => {
      const from = spanById.get(link.blockerId);
      const to = spanById.get(link.dependentId);
      const fromRow = rowIndexById.get(link.blockerId);
      const toRow = rowIndexById.get(link.dependentId);
      // Both ends must be drawn — an arrow into empty space is worse than no
      // arrow. The service already bounds links to the visible set; this is
      // the belt to that braces.
      if (!from || !to || fromRow === undefined || toRow === undefined) return null;

      const a = barBox(axis, from);
      const b = barBox(axis, to);
      // Finish-to-start: out of the blocker's right edge, into the
      // dependent's left. The only dependency shape EAGLES stores.
      const x1 = a.left + a.width;
      const y1 = fromRow * ROW_H + BAR_MID;
      const x2 = b.left;
      const y2 = toRow * ROW_H + BAR_MID;

      // Elbow with a stub either side, so an arrow leaving a bar is visibly
      // attached to it even when the two bars nearly touch.
      const stub = 10;
      const midX = x2 - stub > x1 + stub ? (x1 + x2) / 2 : x1 + stub;
      const d = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;

      return { id: link.id, d, x2, y2, conflict: link.conflict };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (paths.length === 0) return null;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      width={axis.width}
      height={height}
      aria-hidden
    >
      {paths.map((p) => (
        <g
          key={p.id}
          // Red is reserved for the impossible plan (BR-8): the blocker
          // finishes after the dependent starts. A normal arrow stays quiet —
          // if every arrow shouted, the ones that matter would not.
          className={p.conflict ? "text-destructive" : "text-muted-foreground/45"}
        >
          <path
            d={p.d}
            fill="none"
            stroke="currentColor"
            strokeWidth={p.conflict ? 1.75 : 1.25}
            strokeDasharray={p.conflict ? "4 3" : undefined}
          />
          <polygon
            points={`${p.x2},${p.y2} ${p.x2 - 5},${p.y2 - 3.5} ${p.x2 - 5},${p.y2 + 3.5}`}
            fill="currentColor"
          />
        </g>
      ))}
    </svg>
  );
}

export const TIMELINE_ROW_HEIGHT = ROW_H;
