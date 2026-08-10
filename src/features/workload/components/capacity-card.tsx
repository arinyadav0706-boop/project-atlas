"use client";

import { useCallback, useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import {
  Chart,
  capacityBarsHeight,
  capacityBarsOption,
  capacityBarsSummary,
  type CapacityBar,
  type CapacityReference,
  type ChartTheme,
} from "@/shared/components/charts";
import { LIGHT_WEEKS, OVERLOADED_WEEKS } from "@/features/workload/lib/capacity";
import { STATUS_META, rowCaption } from "@/features/workload/components/status-meta";
import type { WorkloadRowDto } from "@/features/workload/types/workload.types";

// Every person on one comparable axis.
//
// The band edges from BR-6 are drawn on the chart, so the colours are explained
// by the axis rather than only by a legend.
const CAPACITY_REFERENCES: CapacityReference[] = [
  { weeks: LIGHT_WEEKS, label: `${LIGHT_WEEKS} wk` },
  { weeks: OVERLOADED_WEEKS, label: `${OVERLOADED_WEEKS} wk` },
];

// The y-axis carries names, not avatars, unlike the mockup. This is a canvas:
// an avatar there means drawing image-or-initials fallbacks into ECharts rich
// text, and no seeded user even has an avatar URL. The name is the information;
// avatars appear in every DOM list on this page, where they are free.
export function CapacityCard({ rows }: { rows: WorkloadRowDto[] }) {
  // Already most-loaded-first from the service (BR-10); the chart keeps that
  // order so it reads in the same sequence as All people below.
  const bars: CapacityBar[] = useMemo(
    () =>
      rows.map((row) => ({
        key: row.userId,
        label: row.name,
        weeks: row.weeksOfWork,
        tone: STATUS_META[row.status].tone,
        caption: rowCaption(row),
      })),
    [rows],
  );

  const buildOption = useCallback(
    (theme: ChartTheme) => capacityBarsOption(bars, CAPACITY_REFERENCES, theme),
    [bars],
  );

  return (
    <Card>
      <CardHeader icon={<BarChart3 />} title="Weeks queued per person" />
      <CardContent>
        <Chart
          buildOption={buildOption}
          height={capacityBarsHeight(bars.length)}
          summary={capacityBarsSummary(bars)}
        />
      </CardContent>
    </Card>
  );
}
