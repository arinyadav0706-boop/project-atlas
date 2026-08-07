"use client";

import { useCallback, useMemo, useState } from "react";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import {
  Chart,
  ChartEmpty,
  burndownLineOption,
  burndownSummary,
  burndownUnitLabel,
  statusDonutOption,
  statusDonutSummary,
  velocityOption,
  velocitySummary,
  type BurndownAxisUnit,
  type ChartTheme,
  type ChartTone,
  type StatusSegment,
} from "@/shared/components/charts";
import type {
  BurndownData,
  CycleTimeData,
  ReportResultDto,
  StatusBreakdownData,
  VelocityData,
} from "@/features/reports/types/report.types";

// Renders one report by its chartType (ADR-0020). Charts are ECharts, built
// from the shared option builders (ADR-0036) — never hand-rolled per report.
export function ReportCard({
  result,
  projectId,
}: {
  result: ReportResultDto;
  projectId: string;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{result.name}</h2>
      <div className="mt-4">
        {result.chartType === "bar" && <VelocityChart data={result.data as VelocityData} />}
        {result.chartType === "donut" && (
          <StatusDonut data={result.data as StatusBreakdownData} />
        )}
        {result.chartType === "kpi" && <CycleTimeKpi data={result.data as CycleTimeData} />}
        {result.chartType === "line" && (
          <BurndownChart initial={result.data as BurndownData} projectId={projectId} />
        )}
      </div>
    </section>
  );
}

const UNITS: { value: BurndownAxisUnit; label: string }[] = [
  { value: "points", label: "Points" },
  { value: "issues", label: "Issues" },
  { value: "hours", label: "Hours" },
];

// Sprint burndown (ADR-0037). The only interactive report: the sprint and the
// unit are viewer choices, so this card refetches rather than reloading the
// page. Seeded with the server-rendered result, so it draws before any fetch.
function BurndownChart({ initial, projectId }: { initial: BurndownData; projectId: string }) {
  const [data, setData] = useState<BurndownData>(initial);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(
    async (next: { sprintId?: string | null; unit?: BurndownAxisUnit }) => {
      const sprintId = next.sprintId ?? data.selectedSprintId;
      const unit = next.unit ?? data.unit;
      setLoading(true);
      try {
        const query = new URLSearchParams({ unit });
        if (sprintId) query.set("sprintId", sprintId);
        const result = await apiRequest<ReportResultDto>(
          `/api/projects/${projectId}/reports/burndown?${query.toString()}`,
        );
        setData(result.data as BurndownData);
      } finally {
        setLoading(false);
      }
    },
    [data.selectedSprintId, data.unit, projectId],
  );

  // Memoised: a fresh `[]` on every render would change the callback identity
  // and tear the canvas down and rebuild it each time.
  const points = useMemo(() => data.series?.points ?? [], [data.series]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const buildOption = useCallback(
    (theme: ChartTheme) => burndownLineOption(points, data.unit, theme, today),
    [points, data.unit, today],
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {data.sprints.length > 1 && (
          <select
            value={data.selectedSprintId ?? ""}
            onChange={(e) => reload({ sprintId: e.target.value })}
            aria-label="Sprint"
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {data.sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.status === "ACTIVE" ? " · active" : ""}
              </option>
            ))}
          </select>
        )}
        <div className="flex rounded-md border border-border p-0.5" role="group" aria-label="Unit">
          {UNITS.map((u) => (
            <button
              key={u.value}
              type="button"
              onClick={() => reload({ unit: u.value })}
              aria-pressed={data.unit === u.value}
              className={cn(
                "rounded px-2 py-0.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                data.unit === u.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {u.label}
            </button>
          ))}
        </div>
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      {/* Empty ≠ zero ≠ unknown: a sprint we cannot plot says why, rather than
          drawing a flat line that reads as "nothing happened". */}
      {!data.series || points.length === 0 ? (
        <ChartEmpty>{data.reason ?? "Nothing to plot for this sprint yet."}</ChartEmpty>
      ) : (
        <Chart
          buildOption={buildOption}
          height={240}
          summary={burndownSummary(points, data.unit)}
        />
      )}

      <div className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
        {data.series && (
          <p>
            {burndownUnitLabel(data.unit)} across {data.sprintName ?? "this sprint"}, against a
            straight ideal line.
          </p>
        )}
        {/* The cohort caveat (ADR-0037 §1). Stated on the chart, every time —
            this is the report's one approximation and hiding it would make the
            rest of the numbers untrustworthy too. */}
        {data.series && (
          <p>
            Based on the {data.issueCount} {data.issueCount === 1 ? "issue" : "issues"} in this
            sprint <strong className="font-medium">now</strong> — issues added or removed
            mid-sprint aren&apos;t reflected yet. Status history is exact.
          </p>
        )}
        {data.unsized > 0 && (
          <p>
            {data.unsized} of them have no {data.unit === "hours" ? "estimate" : "story points"},
            so the line is a floor, not a reading.
          </p>
        )}
        {data.untrackedDone > 0 && (
          <p>
            {data.untrackedDone} were completed before we recorded status history, so they count
            as done from day one.
          </p>
        )}
      </div>
    </div>
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
