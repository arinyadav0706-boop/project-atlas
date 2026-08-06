"use client";

import { useCallback, useMemo } from "react";
import {
  Chart,
  ChartEmpty,
  statusDonutOption,
  statusDonutSummary,
  velocityOption,
  velocitySummary,
  type ChartTheme,
  type ChartTone,
  type StatusSegment,
} from "@/shared/components/charts";
import type {
  CycleTimeData,
  ReportResultDto,
  StatusBreakdownData,
  VelocityData,
} from "@/features/reports/types/report.types";

// Renders one report by its chartType (ADR-0020). Charts are ECharts, built
// from the shared option builders (ADR-0036) — never hand-rolled per report.
export function ReportCard({ result }: { result: ReportResultDto }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{result.name}</h2>
      <div className="mt-4">
        {result.chartType === "bar" && <VelocityChart data={result.data as VelocityData} />}
        {result.chartType === "donut" && (
          <StatusDonut data={result.data as StatusBreakdownData} />
        )}
        {result.chartType === "kpi" && <CycleTimeKpi data={result.data as CycleTimeData} />}
      </div>
    </section>
  );
}

function VelocityChart({ data }: { data: VelocityData }) {
  // Memoised so the canvas is not torn down and rebuilt on every parent render.
  const buildOption = useCallback(
    (theme: ChartTheme) => velocityOption(data.sprints, theme),
    [data.sprints],
  );

  if (data.sprints.length === 0) {
    return <ChartEmpty>No completed sprints yet.</ChartEmpty>;
  }

  return (
    <div>
      <Chart buildOption={buildOption} height={240} summary={velocitySummary(data.sprints)} />
      <p className="mt-2 text-xs text-muted-foreground">
        Completed story points per finished sprint, oldest first. Issues with no estimate count
        as zero points.
      </p>
    </div>
  );
}

// Workflow order, not size order — the donut reads like the board.
const STATUS_TONE: Record<string, ChartTone> = {
  TODO: "neutral",
  IN_PROGRESS: "accent",
  IN_REVIEW: "warning",
  DONE: "success",
};

function StatusDonut({ data }: { data: StatusBreakdownData }) {
  const segments: StatusSegment[] = useMemo(
    () =>
      data.segments.map((s) => ({
        status: s.status,
        label: s.label,
        count: s.count,
        tone: STATUS_TONE[s.status] ?? "neutral",
      })),
    [data.segments],
  );
  const buildOption = useCallback(
    (theme: ChartTheme) => statusDonutOption(segments, data.total, theme),
    [segments, data.total],
  );

  if (data.total === 0) {
    return <ChartEmpty>No issues yet.</ChartEmpty>;
  }

  return (
    <div>
      <Chart
        buildOption={buildOption}
        height={200}
        summary={statusDonutSummary(segments, data.total)}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        Every live issue in the project, Done included.
      </p>
    </div>
  );
}

// A single number is not a chart (ADR-0036): no canvas here.
function CycleTimeKpi({ data }: { data: CycleTimeData }) {
  return (
    <div>
      {data.averageDays === null ? (
        <ChartEmpty>No issues completed in the last {data.windowDays} days.</ChartEmpty>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-semibold text-foreground">{data.averageDays}</span>
            <span className="text-sm text-muted-foreground">days avg</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            In Progress → Done, across {data.sampleSize}{" "}
            {data.sampleSize === 1 ? "issue" : "issues"} in the last {data.windowDays} days.
          </p>
        </>
      )}
    </div>
  );
}
