import { Activity, Coffee, Scale, Smile } from "lucide-react";
import { formatDuration } from "@/features/time-tracking/lib/duration";
import { LIGHT_WEEKS, OVERLOADED_WEEKS } from "@/features/workload/lib/capacity";
import type { ChartTone } from "@/shared/components/charts";
import type { WorkloadRowDto, WorkloadStatus } from "@/features/workload/types/workload.types";

// The page's vocabulary, defined once.
//
// Status is carried by a label AND a colour, never colour alone (21_workload.md
// §5). `tone` is the same meaning expressed for a canvas, so a band is never
// one colour in a chart and a different one in a row — that agreement is the
// reason this table exists instead of each card picking its own classes.
//
// `band` is the threshold in words. The four bands are how the whole page
// talks, so they are written on screen rather than left to a legend a reader
// has to hunt for.
export const STATUS_META: Record<
  WorkloadStatus,
  {
    label: string;
    band: string;
    tone: ChartTone;
    /** Legend/heading dot. */
    dot: string;
    /** The weeks pill in the Overloaded / Has room lists. */
    chip: string;
    /** Tinted icon chip on the People-at-a-glance tiles. */
    tile: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  OVERLOADED: {
    label: "Overloaded",
    band: `> ${OVERLOADED_WEEKS} wk`,
    tone: "danger",
    dot: "bg-destructive",
    chip: "bg-destructive/10 text-destructive",
    tile: "bg-destructive/10 text-destructive",
    icon: Activity,
  },
  BALANCED: {
    label: "Balanced",
    band: `${LIGHT_WEEKS} – ${OVERLOADED_WEEKS} wk`,
    tone: "accent",
    dot: "bg-accent",
    chip: "bg-accent/10 text-accent",
    tile: "bg-accent/10 text-accent",
    icon: Scale,
  },
  LIGHT: {
    label: "Has room",
    band: `< ${LIGHT_WEEKS} wk`,
    tone: "success",
    dot: "bg-success",
    chip: "bg-success/10 text-success",
    tile: "bg-success/10 text-success",
    icon: Smile,
  },
  IDLE: {
    label: "No open work",
    band: "0 issues",
    tone: "neutral",
    dot: "bg-muted-foreground/40",
    chip: "bg-muted text-muted-foreground",
    tile: "bg-muted text-muted-foreground",
    icon: Coffee,
  },
};

// Most urgent first — the whole point of the page is spotting the top group.
export const SECTION_ORDER: WorkloadStatus[] = ["OVERLOADED", "BALANCED", "LIGHT", "IDLE"];

/** Zero remaining effort is a dash, not "0m": there is nothing queued to read. */
export function hours(minutes: number): string {
  return minutes === 0 ? "—" : formatDuration(minutes);
}

export function rowCaption(row: WorkloadRowDto): string {
  if (row.openIssues === 0) return "no open work";
  return `${hours(row.remainingMinutes)} · ${row.openIssues} ${
    row.openIssues === 1 ? "issue" : "issues"
  }`;
}

/** "2.6 wk", or a dash when the person has nothing open at all. */
export function weeksLabel(row: WorkloadRowDto): string {
  return row.openIssues === 0 ? "—" : `${row.weeksOfWork} wk`;
}

export function countByStatus(rows: WorkloadRowDto[], status: WorkloadStatus): number {
  return rows.reduce((n, r) => n + (r.status === status ? 1 : 0), 0);
}
