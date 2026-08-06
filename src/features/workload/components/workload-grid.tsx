"use client";

import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { formatDuration } from "@/features/time-tracking/lib/duration";
import { formatCapacityPercent } from "@/features/workload/lib/capacity";
import type {
  WorkingWeekDto,
  WorkloadGridCellDto,
  WorkloadGridDto,
} from "@/features/workload/types/workload.types";

// The people × weeks grid (ADR-0035).
//
// A DOM table rather than an ECharts canvas, deliberately: the values must not
// live only in a tooltip, the first column must stick, and the whole thing has
// to survive a screen reader — none of which a canvas gives us. ADR-0035 §7
// records the exception to ADR-0036.

// Overdue is its own meaning, not just "more work": §6 of the visualisation
// doc maps overdue to `destructive`, the same token as over-capacity. Tinting
// it with the ordinary accent ramp would let a red column header sit above
// cells that read as routine.
type CellTone = "scheduled" | "overdue";

// A single hue's opacity ramp, never a rainbow (03_Data_Visualisation.md §6):
// a rainbow invents categories that do not exist in a continuous quantity.
// Written as literal class strings so Tailwind's scanner keeps them.
function cellTone(percent: number, minutes: number, tone: CellTone): string {
  if (minutes === 0) return "";
  if (tone === "overdue") {
    const ring = "ring-1 ring-inset ring-destructive/40";
    if (percent > 75) return `bg-destructive/30 ${ring}`;
    if (percent > 50) return `bg-destructive/25 ${ring}`;
    if (percent > 25) return `bg-destructive/20 ${ring}`;
    return `bg-destructive/15 ${ring}`;
  }
  // Over capacity gets a full-strength ring as well as the tint, so the signal
  // survives for a reader who cannot separate the two hues.
  if (percent > 100) return "bg-destructive/15 ring-1 ring-inset ring-destructive";
  if (percent > 75) return "bg-accent/50";
  if (percent > 50) return "bg-accent/35";
  if (percent > 25) return "bg-accent/20";
  return "bg-accent/10";
}

function Cell({
  cell,
  label,
  tone = "scheduled",
}: {
  cell: WorkloadGridCellDto;
  label: string;
  tone?: CellTone;
}) {
  if (cell.minutes === 0) {
    return (
      <td className="px-2 py-2 text-center text-xs text-muted-foreground/50">
        <span className="sr-only">{label}: nothing</span>
        <span aria-hidden>—</span>
      </td>
    );
  }

  return (
    <td className="p-1">
      <div
        className={cn(
          "rounded px-2 py-1.5 text-center",
          cellTone(cell.percentOfCapacity, cell.minutes, tone),
        )}
      >
        <span className="sr-only">
          {label}: {formatDuration(cell.minutes)},{" "}
          {formatCapacityPercent(cell.minutes, cell.percentOfCapacity)} of a week
          {cell.inferred ? ", inferred from the sprint" : ""}
          {cell.percentOfCapacity > 100 ? ", over capacity" : ""}
        </span>
        <div aria-hidden className="text-sm font-medium leading-tight text-foreground">
          {formatDuration(cell.minutes)}
          {/* Provenance, straight from Jira: a number placed from sprint dates
              rather than the issue's own is visibly a guess. */}
          {cell.inferred && (
            <span className="ml-0.5 align-super text-[9px] font-semibold text-muted-foreground">
              S
            </span>
          )}
        </div>
        <div
          aria-hidden
          className={cn(
            "text-[10px] leading-tight",
            tone === "overdue" || cell.percentOfCapacity > 100
              ? "font-medium text-destructive"
              : "text-muted-foreground",
          )}
        >
          {formatCapacityPercent(cell.minutes, cell.percentOfCapacity)}
        </div>
      </div>
    </td>
  );
}

export function WorkloadGrid({
  grid,
  workingWeek,
}: {
  grid: WorkloadGridDto;
  workingWeek: WorkingWeekDto;
}) {
  if (grid.rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
        This team has no members yet.
      </p>
    );
  }

  const headCell = "px-2 py-2 text-center text-xs font-medium text-muted-foreground";

  return (
    <div>
      {/* Wide content scrolls inside its own container, never the page
          (03_Data_Visualisation.md §4 rule 8). `relative` is load-bearing: the
          screen-reader labels below are `sr-only`, which is `position:absolute`,
          and without a positioned ancestor they anchor to the document and drag
          ITS scroll width out to the table's full width — the page then scrolls
          sideways on a phone even though this container is doing its job. */}
      <div className="relative overflow-x-auto rounded-lg border border-border bg-background">
        <table className="w-full min-w-[44rem] border-collapse">
          <caption className="sr-only">
            Remaining work per person by week, placed by due date. Based on a{" "}
            {workingWeek.label}.
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="sticky left-0 z-10 bg-background px-4 py-2 text-left text-xs font-medium text-muted-foreground"
              >
                Person
              </th>
              {grid.hasOverdue && (
                <th scope="col" className={cn(headCell, "text-destructive")}>
                  Overdue
                </th>
              )}
              {grid.weeks.map((w) => (
                <th key={w.start} scope="col" className={headCell}>
                  <span className={cn(w.isCurrent && "text-foreground")}>{w.label}</span>
                  {w.isCurrent && (
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      this week
                    </span>
                  )}
                </th>
              ))}
              {grid.hasLater && (
                <th scope="col" className={headCell}>
                  Later
                </th>
              )}
              <th scope="col" className={headCell}>
                Unscheduled
              </th>
            </tr>
          </thead>
          <tbody>
            {grid.rows.map((row) => (
              <tr key={row.userId} className="border-b border-border last:border-0">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-background px-4 py-2 text-left font-normal"
                >
                  <span className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
                      <AvatarFallback className="text-[10px]">
                        {row.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate text-sm text-foreground">{row.name}</span>
                  </span>
                </th>

                {grid.hasOverdue && (
                  <Cell cell={row.overdue} label={`${row.name}, overdue`} tone="overdue" />
                )}
                {row.weeks.map((cell, i) => (
                  <Cell
                    key={grid.weeks[i]!.start}
                    cell={cell}
                    label={`${row.name}, ${grid.weeks[i]!.label}`}
                  />
                ))}
                {grid.hasLater && <Cell cell={row.later} label={`${row.name}, later`} />}

                {/* Undated work has no time period to be a percentage of, so it
                    stays a plain number rather than implying a rate. */}
                <td className="px-2 py-2 text-center text-sm">
                  {row.unscheduledMinutes === 0 ? (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  ) : (
                    <span className="text-muted-foreground">
                      {formatDuration(row.unscheduledMinutes)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
        <p>
          Work is placed by <strong className="font-medium">due date</strong>, spread across the
          working days up to it — this shows demand by deadline, not a plan of who does what when.
          Percentages are of a {workingWeek.label}.
        </p>
        {grid.hasInferred && (
          <p>
            <span className="font-semibold">S</span> — no due date on the issue, so the dates come
            from its sprint.
          </p>
        )}
        <p>
          <span className="font-medium text-foreground">Unscheduled</span> is work carrying no due
          date and no sprint. It is real work with no place in the calendar yet.
        </p>
      </div>
    </div>
  );
}
