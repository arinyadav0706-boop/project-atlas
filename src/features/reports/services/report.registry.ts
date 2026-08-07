import { ReportRepository } from "@/features/reports/repositories/report.repository";
import { buildBurndown, type BurndownUnit } from "@/features/reports/lib/burndown";
import type {
  ReportCategory,
  ReportChartType,
  ReportMetaDto,
  ReportResultDto,
} from "@/features/reports/types/report.types";

// The report registry (ADR-0020). Each report is a self-contained definition;
// the API dispatches by `id`, the UI renders by `chartType`. Add a report =
// add a definition here (+ a renderer only if it needs a new chart type).

export interface ReportDefinition {
  id: string;
  name: string;
  description: string;
  category: ReportCategory;
  chartType: ReportChartType;
  // `projectId` is already authorized by the service; params come from the query.
  compute(projectId: string, params: Record<string, string>): Promise<ReportResultDto>;
}

const STATUS_LABELS: Record<string, string> = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
};
const STATUS_ORDER = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"];

function envelope(def: ReportDefinition, data: ReportResultDto["data"]): ReportResultDto {
  return {
    id: def.id,
    name: def.name,
    chartType: def.chartType,
    generatedAt: new Date().toISOString(),
    data,
  };
}

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

const velocity: ReportDefinition = {
  id: "velocity",
  name: "Velocity",
  description: "Completed story points per completed sprint.",
  category: "delivery",
  chartType: "bar",
  async compute(projectId) {
    const sprints = await ReportRepository.completedSprintVelocity(projectId, 8);
    return envelope(velocity, { sprints });
  },
};

const statusBreakdown: ReportDefinition = {
  id: "status-breakdown",
  name: "Status breakdown",
  // Counts every live issue, Done included — see docs/12_Metrics §Status
  // breakdown. Saying "open work" here would misdescribe the donut.
  description: "How the project's issues are distributed across statuses.",
  category: "flow",
  chartType: "donut",
  async compute(projectId) {
    const rows = await ReportRepository.statusBreakdown(projectId);
    const byStatus = new Map<string, number>(rows.map((r) => [r.status, r.count]));
    const segments = STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_LABELS[status] ?? status,
      count: byStatus.get(status) ?? 0,
    }));
    const total = segments.reduce((sum, s) => sum + s.count, 0);
    return envelope(statusBreakdown, { total, segments });
  },
};

const cycleTime: ReportDefinition = {
  id: "cycle-time",
  name: "Cycle time",
  description: "Average time from In Progress to Done for recently completed issues.",
  category: "flow",
  chartType: "kpi",
  async compute(projectId, params) {
    const windowDays = clampInt(params.windowDays, 30, 1, 365);
    const since = new Date(Date.now() - windowDays * 86_400_000);
    const logs = await ReportRepository.cycleTimeTransitions(projectId, since);

    const firstInProgress = new Map<string, Date>();
    const firstDone = new Map<string, Date>();
    for (const log of logs) {
      // logs are createdAt-ascending, so the first seen is the earliest.
      if (log.status === "IN_PROGRESS" && !firstInProgress.has(log.entityId)) {
        firstInProgress.set(log.entityId, log.createdAt);
      }
      if (log.status === "DONE" && !firstDone.has(log.entityId)) {
        firstDone.set(log.entityId, log.createdAt);
      }
    }

    const durationsMs: number[] = [];
    for (const [entityId, done] of firstDone) {
      const started = firstInProgress.get(entityId);
      if (started && done.getTime() > started.getTime()) {
        durationsMs.push(done.getTime() - started.getTime());
      }
    }
    const sampleSize = durationsMs.length;
    const averageDays =
      sampleSize === 0
        ? null
        : Math.round(
            (durationsMs.reduce((a, b) => a + b, 0) / sampleSize / 86_400_000) * 10,
          ) / 10;

    return envelope(cycleTime, { averageDays, sampleSize, windowDays });
  },
};

const BURNDOWN_UNITS: BurndownUnit[] = ["points", "issues", "hours"];

const burndown: ReportDefinition = {
  id: "burndown",
  name: "Sprint burndown",
  // Says "by due date"-style what it is, not what a reader might wish it were:
  // the cohort caveat is stated on the chart itself (ADR-0037 §1).
  description: "Remaining work per day across a sprint, against an ideal line.",
  category: "delivery",
  chartType: "line",
  async compute(projectId, params) {
    const unit: BurndownUnit = BURNDOWN_UNITS.includes(params.unit as BurndownUnit)
      ? (params.unit as BurndownUnit)
      : "points";

    const sprints = await ReportRepository.burndownSprints(projectId);
    const options = sprints.map((s) => ({ id: s.id, name: s.name, status: s.status }));

    const empty = (reason: string, selected: (typeof sprints)[number] | null = null) =>
      envelope(burndown, {
        unit,
        sprints: options,
        selectedSprintId: selected?.id ?? null,
        sprintName: selected?.name ?? null,
        series: null,
        reason,
        issueCount: 0,
        unsized: 0,
        untrackedDone: 0,
        flatReason: null,
      });

    if (sprints.length === 0) {
      return empty("No sprint has run yet — a burndown needs a started sprint with dates.");
    }

    // An unknown or out-of-project id falls back rather than 404s: this is a
    // chart parameter, not a resource lookup.
    const sprint = sprints.find((s) => s.id === params.sprintId) ?? sprints[0]!;
    if (!sprint.startDate || !sprint.endDate) {
      return empty("This sprint has no start and end date, so there is nothing to plot.", sprint);
    }

    const cohort = await ReportRepository.sprintCohort(sprint.id);
    const history = await ReportRepository.statusHistory(cohort.map((i) => i.id));

    const series = buildBurndown(
      cohort,
      history.map((h) => ({
        issueId: h.entityId,
        from: (h.beforeData as { status?: string } | null)?.status ?? null,
        to: (h.afterData as { status?: string } | null)?.status ?? null,
        at: h.createdAt,
      })),
      { startDate: sprint.startDate, endDate: sprint.endDate },
      unit,
      new Date(),
    );

    if (series.points.length === 0) {
      return empty("This sprint hasn't started yet.", sprint);
    }

    return envelope(burndown, {
      unit,
      sprints: options,
      selectedSprintId: sprint.id,
      sprintName: sprint.name,
      series: { scope: series.scope, points: series.points },
      reason: null,
      issueCount: series.issueCount,
      unsized: series.unsized,
      untrackedDone: series.untrackedDone,
      flatReason: series.flatReason,
    });
  },
};

// The registry. Order here is the display order in the UI.
export const REPORTS: ReportDefinition[] = [velocity, burndown, statusBreakdown, cycleTime];

export const REPORTS_BY_ID: Record<string, ReportDefinition> = Object.fromEntries(
  REPORTS.map((r) => [r.id, r]),
);

export function reportMeta(def: ReportDefinition): ReportMetaDto {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    category: def.category,
    chartType: def.chartType,
  };
}
