"use client";

import {
  ArrowDown,
  ArrowUp,
  Briefcase,
  Copy,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  SquareCheckBig,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { TimesheetCell } from "@/features/timesheets/components/timesheet-cell";
import { dayHeading, dayLong, minutesLabel } from "@/features/timesheets/lib/format";
import { cn } from "@/shared/lib/utils";
import type { TimesheetDayDto, TimesheetRowDto } from "@/features/timesheets/types/timesheet.types";

// The week grid (37_timesheets §5.3). Rows are work items, columns are days.
// Plain table semantics so a screen reader can move by row and column.

export type RowAction = "edit" | "pin" | "unpin" | "duplicate" | "up" | "down" | "remove";

export function rowDomId(rowId: string): string {
  return `ts-row-${rowId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function rowTitle(row: TimesheetRowDto): { primary: string; key: string | null; secondary: string } {
  if (row.issue) {
    return { primary: row.issue.title, key: row.issue.key, secondary: row.issue.projectName };
  }
  const tags = [row.project?.name, row.client?.name].filter(Boolean).join(" · ");
  return {
    primary: row.activity?.name ?? "Activity",
    key: null,
    secondary: tags ? `Activity · ${tags}` : "Activity",
  };
}

function dayKindLabel(day: TimesheetDayDto): string | null {
  if (day.kind === "LEAVE") return day.label ?? "Leave";
  if (day.kind === "HOLIDAY") return day.label ?? "Holiday";
  return null;
}

export function TimesheetGrid({
  rows,
  days,
  canEdit,
  canOverrideBillable,
  highlightRowId,
  onSaveCell,
  onToggleBillable,
  onRowAction,
  selectable,
  selected,
  onToggleSelected,
}: {
  rows: TimesheetRowDto[];
  days: TimesheetDayDto[];
  canEdit: boolean;
  canOverrideBillable: boolean;
  highlightRowId: string | null;
  onSaveCell?: (row: TimesheetRowDto, date: string, duration: string, note?: string | null) => Promise<boolean>;
  onToggleBillable?: (row: TimesheetRowDto) => void;
  onRowAction?: (row: TimesheetRowDto, action: RowAction) => void;
  // Approver mode: pick lines to return.
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onToggleSelected?: (rowId: string) => void;
}) {
  const weekTotal = rows.reduce((s, r) => s + r.totalMinutes, 0);

  return (
    // Fixed layout with explicit widths: when the submit panel takes space, the
    // grid scrolls sideways instead of squeezing durations onto two lines.
    <table className="w-full min-w-[1120px] table-fixed border-separate border-spacing-0 whitespace-nowrap text-meta">
      <thead className="sticky top-0 z-10 bg-background">
        <tr>
          <th scope="col" className="w-10 border-b border-border px-2 py-2 text-left text-label text-muted-foreground">
            {selectable ? <span className="sr-only">Select</span> : "#"}
          </th>
          <th scope="col" className="w-[300px] border-b border-border px-2 py-2 text-left text-label text-muted-foreground">
            Work item
          </th>
          <th scope="col" className="w-28 border-b border-border px-2 py-2 text-left text-label text-muted-foreground">
            <span className="sr-only">Billable</span>
          </th>
          {days.map((day) => {
            const h = dayHeading(day.date);
            const kind = dayKindLabel(day);
            return (
              <th
                key={day.date}
                scope="col"
                className={cn(
                  "w-[76px] border-b border-l border-border px-1 py-1.5 text-center font-normal",
                  day.kind === "WEEKEND" && "bg-muted/40",
                  day.kind === "LEAVE" && "bg-success/10",
                  day.kind === "HOLIDAY" && "bg-info/10",
                  day.overtime && "bg-destructive/10",
                )}
              >
                <span className={cn("block text-label", day.overtime ? "text-destructive" : "text-foreground")}>
                  {h.weekday}
                </span>
                <span className={cn("block text-micro", day.overtime ? "text-destructive" : "text-muted-foreground")}>
                  {h.day}
                </span>
                {kind && <span className="block text-micro text-muted-foreground">({kind})</span>}
                {day.overtime && (
                  <span className="block text-micro font-medium text-destructive">
                    Overtime · {minutesLabel(day.totalMinutes)}
                  </span>
                )}
              </th>
            );
          })}
          <th scope="col" className="w-20 border-b border-l border-border px-2 py-2 text-right text-label text-foreground">
            Total
          </th>
          <th scope="col" className="w-10 border-b border-border">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const t = rowTitle(row);
          const label = row.issue ? `${row.issue.key} ${row.issue.title}` : t.primary;
          const rowKey = row.id ?? `row-${index}`;
          const isHighlighted = highlightRowId !== null && highlightRowId === row.id;
          return (
            <tr
              key={rowKey}
              id={row.id ? rowDomId(row.id) : undefined}
              className={cn(
                "align-middle transition-colors",
                row.returnedReason && "bg-warning/5",
                isHighlighted && "bg-primary/5",
              )}
            >
              <td className="border-b border-border px-2 py-1.5 text-muted-foreground tabular-nums">
                {selectable && row.id ? (
                  <input
                    type="checkbox"
                    aria-label={`Return ${label}`}
                    checked={selected?.has(row.id) ?? false}
                    onChange={() => onToggleSelected?.(row.id!)}
                    className="h-4 w-4 accent-primary"
                  />
                ) : (
                  index + 1
                )}
              </td>
              <td className="border-b border-border px-2 py-1.5">
                <div className="flex min-w-0 items-start gap-2">
                  {row.kind === "ISSUE" ? (
                    <SquareCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-label="Issue" />
                  ) : (
                    <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-label="Activity" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      {t.key && <span className="shrink-0 text-micro font-medium text-muted-foreground">{t.key}</span>}
                      <span className="truncate text-meta font-medium text-foreground">{t.primary}</span>
                      {row.pinned && <Pin className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Recurring" />}
                    </div>
                    <div className="truncate text-micro text-muted-foreground">{t.secondary}</div>
                    {row.returnedReason && (
                      <div className="mt-0.5 flex items-center gap-1 text-micro">
                        <TriangleAlert className="h-3 w-3 shrink-0 text-warning" aria-hidden />
                        <span className="text-foreground">Returned: {row.returnedReason}</span>
                      </div>
                    )}
                    {row.activity?.requiresProject && !row.project && (
                      <div className="text-micro text-destructive">Project required</div>
                    )}
                  </div>
                </div>
              </td>
              <td className="border-b border-border px-2 py-1.5">
                <button
                  type="button"
                  disabled={!row.editable || !canOverrideBillable || !row.id || row.id.startsWith("pinned:")}
                  onClick={() => onToggleBillable?.(row)}
                  aria-label={`${label}: ${row.billable ? "billable" : "non-billable"}${row.editable && canOverrideBillable ? ", click to change" : ""}`}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium",
                    row.billable ? "text-foreground" : "text-muted-foreground",
                    row.editable && canOverrideBillable && "hover:bg-muted",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn("h-1.5 w-1.5 rounded-full", row.billable ? "bg-success" : "bg-muted-foreground/50")}
                  />
                  {row.billable ? "Billable" : "Non-billable"}
                </button>
              </td>
              {row.cells.map((cell) => {
                const day = days.find((d) => d.date === cell.date);
                return (
                  <td
                    key={cell.date}
                    className={cn(
                      "border-b border-l border-border px-1 py-1",
                      day?.kind === "WEEKEND" && "bg-muted/40",
                      day?.kind === "LEAVE" && "bg-success/5",
                      day?.kind === "HOLIDAY" && "bg-info/5",
                    )}
                  >
                    <TimesheetCell
                      rowId={row.id ?? rowKey}
                      cell={cell}
                      label={`${label}, ${dayLong(cell.date)}`}
                      editable={Boolean(canEdit && row.editable && day?.editable && row.id)}
                      issueHref={null}
                      onSave={(duration, note) => onSaveCell?.(row, cell.date, duration, note) ?? Promise.resolve(false)}
                    />
                  </td>
                );
              })}
              <td className="border-b border-l border-border px-2 py-1.5 text-right text-meta font-semibold tabular-nums text-foreground">
                {minutesLabel(row.totalMinutes)}
              </td>
              <td className="border-b border-border px-1 py-1.5 text-center">
                {onRowAction && row.id && !row.id.startsWith("pinned:") && (
                  <RowMenu row={row} label={label} canEdit={canEdit} first={index === 0} last={index === rows.length - 1} onAction={onRowAction} />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <td className="px-2 py-2" />
          <td className="px-2 py-2 text-label text-muted-foreground" colSpan={2}>
            Total ({rows.length} {rows.length === 1 ? "item" : "items"})
          </td>
          {days.map((day) => (
            <td
              key={day.date}
              className={cn(
                "border-l border-border px-1 py-2 text-center text-meta font-semibold tabular-nums",
                day.overtime ? "text-destructive" : "text-foreground",
              )}
            >
              {minutesLabel(day.totalMinutes)}
            </td>
          ))}
          <td className="border-l border-border px-2 py-2 text-right text-meta font-semibold tabular-nums text-foreground">
            {minutesLabel(weekTotal)}
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

// The shared menu item has no gap or disabled style; this keeps row actions
// readable and makes an unavailable move visibly unavailable.
const ITEM = "gap-2 text-meta data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

function RowMenu({
  row,
  label,
  canEdit,
  first,
  last,
  onAction,
}: {
  row: TimesheetRowDto;
  label: string;
  canEdit: boolean;
  first: boolean;
  last: boolean;
  onAction: (row: TimesheetRowDto, action: RowAction) => void;
}) {
  // Pinning is a preference and works in any week state; the rest change the
  // week and follow its rules (BR-18, BR-19).
  const wholeWeek = canEdit && row.editable && !row.returnedReason;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Actions for ${label}`}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem className={ITEM} onSelect={() => onAction(row, row.pinned ? "unpin" : "pin")}>
          {row.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          {row.pinned ? "Unpin (recurring)" : "Pin as recurring"}
        </DropdownMenuItem>
        {row.editable && canEdit && (
          <DropdownMenuItem className={ITEM} onSelect={() => onAction(row, "edit")}>
            <Pencil className="h-4 w-4" /> Edit
          </DropdownMenuItem>
        )}
        {wholeWeek && (
          <>
            <DropdownMenuItem className={ITEM} onSelect={() => onAction(row, "duplicate")}>
              <Copy className="h-4 w-4" /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} disabled={first} onSelect={() => onAction(row, "up")}>
              <ArrowUp className="h-4 w-4" /> Move up
            </DropdownMenuItem>
            <DropdownMenuItem className={ITEM} disabled={last} onSelect={() => onAction(row, "down")}>
              <ArrowDown className="h-4 w-4" /> Move down
            </DropdownMenuItem>
            <DropdownMenuItem className={`${ITEM} text-destructive`} onSelect={() => onAction(row, "remove")}>
              <Trash2 className="h-4 w-4" /> Remove
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
