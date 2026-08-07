// DTOs for the Reports module (ADR-0020). A report is described by metadata
// (so the UI can list it) and returns a typed result whose `chartType` picks
// the renderer. New reports add a variant here + a definition in the registry.

export type ReportChartType = "bar" | "donut" | "kpi" | "line";
export type ReportCategory = "delivery" | "flow" | "workload";

export interface ReportMetaDto {
  id: string;
  name: string;
  description: string;
  category: ReportCategory;
  chartType: ReportChartType;
}

// --- Per-report data shapes (extend the union as reports are added) ---

export interface VelocityData {
  // Oldest → newest completed sprint (chart reads left→right).
  sprints: { name: string; points: number; issues: number }[];
}

export interface StatusBreakdownData {
  total: number;
  segments: { status: string; label: string; count: number }[];
}

export interface CycleTimeData {
  averageDays: number | null; // null when the sample is empty
  sampleSize: number;
  windowDays: number;
}

// Sprint burndown (ADR-0037). `series` is null when the chart cannot honestly
// be drawn — no runnable sprint, or one without dates — and `reason` says which.
export interface BurndownData {
  unit: "points" | "issues" | "hours";
  sprints: { id: string; name: string; status: string }[];
  selectedSprintId: string | null;
  sprintName: string | null;
  series: {
    scope: number;
    points: { day: string; remaining: number; ideal: number }[];
  } | null;
  reason: string | null;
  // Honesty counters that travel with every result (ADR-0037 §4).
  issueCount: number;
  unsized: number;
  untrackedDone: number;
}

export type ReportData =
  | VelocityData
  | StatusBreakdownData
  | CycleTimeData
  | BurndownData;

export interface ReportResultDto {
  id: string;
  name: string;
  chartType: ReportChartType;
  generatedAt: string;
  data: ReportData;
}
