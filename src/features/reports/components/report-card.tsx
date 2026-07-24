"use client";

import type {
  CycleTimeData,
  ReportResultDto,
  StatusBreakdownData,
  VelocityData,
} from "@/features/reports/types/report.types";

// Renders one report by its chartType (ADR-0020). A new chartType adds a case
// here; existing reports are untouched. Charts are hand-rolled (CSS bars + SVG
// donut) — theme-aware, no chart-lib dependency.
export function ReportCard({ result }: { result: ReportResultDto }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold text-foreground">{result.name}</h2>
      <div className="mt-4">
        {result.chartType === "bar" && <VelocityBars data={result.data as VelocityData} />}
        {result.chartType === "donut" && (
          <StatusDonut data={result.data as StatusBreakdownData} />
        )}
        {result.chartType === "kpi" && <CycleTimeKpi data={result.data as CycleTimeData} />}
      </div>
    </section>
  );
}

function VelocityBars({ data }: { data: VelocityData }) {
  if (data.sprints.length === 0) {
    return <Empty>No completed sprints yet.</Empty>;
  }
  // Bar heights are in PIXELS (scaled to the tallest bar), not percentages —
  // a % height needs a definite-height parent, which a flex column isn't, so
  // percentage bars silently collapse. Pixels are unconditionally reliable.
  const CHART_H = 160;
  const max = Math.max(1, ...data.sprints.map((s) => s.points));
  return (
    <div>
      <div className="flex items-end gap-3" style={{ height: CHART_H }}>
        {data.sprints.map((s, i) => {
          const px = Math.round((s.points / max) * CHART_H);
          return (
            <div key={i} className="flex min-w-0 flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-xs font-medium text-foreground">{s.points}</span>
              <div
                className="w-full rounded-t bg-accent transition-all"
                style={{ height: s.points > 0 ? Math.max(px, 6) : 2 }}
                title={`${s.points} pts · ${s.issues} issues`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-3">
        {data.sprints.map((s, i) => (
          <span
            key={i}
            className="min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground"
            title={s.name}
          >
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  TODO: "#94a3b8",
  IN_PROGRESS: "#3b82f6",
  IN_REVIEW: "#f59e0b",
  DONE: "#22c55e",
};

function StatusDonut({ data }: { data: StatusBreakdownData }) {
  if (data.total === 0) {
    return <Empty>No issues yet.</Empty>;
  }
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const arcs = data.segments
    .filter((s) => s.count > 0)
    .map((s) => {
      const fraction = s.count / data.total;
      const arc = {
        status: s.status,
        dash: fraction * circumference,
        gap: circumference - fraction * circumference,
        offset: -offset * circumference,
      };
      offset += fraction;
      return arc;
    });

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 100 100" className="h-32 w-32 -rotate-90">
        {arcs.map((a) => (
          <circle
            key={a.status}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={STATUS_COLORS[a.status] ?? "#94a3b8"}
            strokeWidth="12"
            strokeDasharray={`${a.dash} ${a.gap}`}
            strokeDashoffset={a.offset}
          />
        ))}
        <text
          x="50"
          y="50"
          className="rotate-90 fill-foreground text-[14px] font-semibold"
          textAnchor="middle"
          dominantBaseline="central"
          transform="rotate(90 50 50)"
        >
          {data.total}
        </text>
      </svg>
      <ul className="space-y-1.5 text-sm">
        {data.segments.map((s) => (
          <li key={s.status} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: STATUS_COLORS[s.status] ?? "#94a3b8" }}
            />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto font-medium text-foreground">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CycleTimeKpi({ data }: { data: CycleTimeData }) {
  return (
    <div>
      {data.averageDays === null ? (
        <Empty>No issues completed in the last {data.windowDays} days.</Empty>
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

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
