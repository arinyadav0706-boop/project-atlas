"use client";

import { useCallback, useMemo } from "react";
import { PieChart } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import {
  Chart,
  percentOf,
  ringDonutOption,
  ringDonutSummary,
  type ChartTheme,
  type RingSegment,
} from "@/shared/components/charts";
import { cn } from "@/shared/lib/utils";
import {
  SECTION_ORDER,
  STATUS_META,
  countByStatus,
} from "@/features/workload/components/status-meta";
import type {
  WorkloadRowDto,
  WorkloadStatus,
} from "@/features/workload/types/workload.types";

// Sized so the legend beside it keeps a full label on one line in the narrow
// column. At 168 it did not: every entry rendered truncated ("Overl… 0 0%"),
// which is a legend that has stopped being a legend.
const RING_SIZE = 132;

// The shape of the team, before any individual name.
//
// The legend is DOM, not ECharts'. ECharts lays legend columns out with spaces,
// so "Overloaded 2 12%" and "No open work 5 29%" do not line up and three
// ragged columns read as sloppy. A grid aligns them; the canvas is left drawing
// only the ring, which is the one part it is needed for.
export function TeamMixCard({ rows }: { rows: WorkloadRowDto[] }) {
  // `key` is narrowed to the status, so the legend indexes STATUS_META without
  // a cast and a new band cannot be added to one and forgotten in the other.
  const segments: (RingSegment & { key: WorkloadStatus })[] = useMemo(
    () =>
      SECTION_ORDER.map((status) => ({
        key: status,
        label: STATUS_META[status].label,
        value: countByStatus(rows, status),
        tone: STATUS_META[status].tone,
      })),
    [rows],
  );

  const center = useMemo(
    () => ({
      value: String(rows.length),
      label: rows.length === 1 ? "Person" : "People",
    }),
    [rows.length],
  );

  const buildOption = useCallback(
    (theme: ChartTheme) => ringDonutOption(segments, center, theme),
    [segments, center],
  );

  return (
    <Card>
      <CardHeader icon={<PieChart />} title="Team mix" />
      <CardContent className="flex items-center gap-4">
        <div className="shrink-0" style={{ width: RING_SIZE }}>
          <Chart
            buildOption={buildOption}
            height={RING_SIZE}
            summary={ringDonutSummary(segments, center)}
          />
        </div>

        {/* `auto` for the label column, not `1fr`: the longest label sets the
            width and the count/percent columns line up after it, instead of the
            label being squeezed to whatever is left and ellipsised. */}
        <dl className="min-w-0 flex-1 space-y-3">
          {segments.map((segment) => (
            <div
              key={segment.key}
              className="grid grid-cols-[auto_1fr_auto_2.5rem] items-center gap-x-2"
            >
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  STATUS_META[segment.key].dot,
                )}
                aria-hidden
              />
              <dt className="whitespace-nowrap text-[12.5px] text-muted-foreground">
                {segment.label}
              </dt>
              <dd className="text-[13px] font-semibold tabular-nums text-foreground">
                {segment.value}
              </dd>
              {/* Of the whole team, so the four percentages sum to 100. */}
              <dd className="text-right text-[13px] tabular-nums text-muted-foreground">
                {percentOf(segment.value, rows.length)}%
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
