"use client";

import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Briefcase,
  CalendarDays,
  Copy,
  FileText,
  HeartHandshake,
  MessageSquareText,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Square,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { TimesheetCell } from "@/features/timesheets/components/timesheet-cell";
import { GLASS } from "@/features/timesheets/components/timesheet-parts";
import { dayHeading, dayLong, minutesLabel } from "@/features/timesheets/lib/format";
import { cn } from "@/shared/lib/utils";
import type { TimesheetDayDto, TimesheetRowDto } from "@/features/timesheets/types/timesheet.types";

// The week grid (37_timesheets §5.3), drawn to the approved mockup. Plain
// table semantics so a screen reader can move by row and column; day states
// are words in the header ("Leave", "Holiday", "10h"), tint is only support.

export type RowAction = "edit" | "pin" | "unpin" | "duplicate" | "up" | "down" | "remove";

export function rowDomId(rowId: string): string {
  return `ts-row-${rowId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

// Full-column tint per day state; the overtime day is the one the eye should
// find first, so it wins over leave/holiday.
function dayTint(day: TimesheetDayDto | undefined): string {
  if (!day) return "";
  if (day.overtime) return "bg-destructive/[0.07]";
  if (day.kind === "LEAVE") return "bg-success/[0.08]";
  if (day.kind === "HOLIDAY") return "bg-holiday/[0.08]";
  return "";
}

function dayInk(day: TimesheetDayDto): string {
  if (day.overtime) return "text-danger-ink";
  if (day.kind === "LEAVE") return "text-leave-ink";
  if (day.kind === "HOLIDAY") return "text-holiday-ink";
  return "";
}

const CATEGORY_ICON: Record<string, typeof Briefcase> = {
  Meetings: CalendarDays,
  "Client work": Users,
  Internal: FileText,
  "People & HR": HeartHandshake,
};

function RowIcon({ row }: { row: TimesheetRowDto }) {
  if (row.kind === "ISSUE") {
    return (
      <span aria-label="Issue" role="img" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary">
        <Square className="h-2.5 w-2.5 fill-white text-white" aria-hidden />
      </span>
    );
  }
  const Icon = CATEGORY_ICON[row.activity?.categoryName ?? ""] ?? (row.activity?.categoryName ? BookOpen : Briefcase);
  return (
    <span aria-label="Activity" role="img" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-warning/[0.14]">
      <Icon className="h-3.5 w-3.5 text-warning-ink" aria-hidden />
    </span>
  );
}

function rowText(row: TimesheetRowDto): { key: string | null; title: string; sub: string } {
  if (row.issue) {
    return { key: row.issue.key, title: row.issue.title, sub: row.issue.projectName };
  }
  const tags = [row.project?.name, row.client?.name].filter(Boolean);
  return { key: null, title: row.activity?.name ?? "Activity", sub: ["Activity", ...tags].join(" · ") };
}

const TH = "border-b border-line px-3 py-3 text-left text-label font-semibold text-foreground";

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
    // Fixed layout with explicit widths: when the submit panel takes space the
    // grid scrolls sideways instead of squeezing durations onto two lines.
    <table className="w-full min-w-[1120px] table-fixed border-separate border-spacing-0 whitespace-nowrap">
      <colgroup>
        <col className="w-12" />
        <col />
        <col className="w-[120px]" />
        {days.map((d) => (
          <col key={d.date} className="w-[84px]" />
        ))}
        <col className="w-[92px]" />
        <col className="w-11" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" className={cn(TH, "pl-5")}>
            {selectable ? <span className="sr-only">Select</span> : "#"}
          </th>
          <th scope="col" className={TH}>
            Work item
          </th>
          <th scope="col" className={TH}>
            <span className="sr-only">Billable</span>
          </th>
          {days.map((day) => {
            const h = dayHeading(day.date);
            const note = day.overtime
              ? `(${minutesLabel(day.totalMinutes)})`
              : day.kind === "LEAVE"
                ? `(${day.label ?? "Leave"})`
                : day.kind === "HOLIDAY"
                  ? `(${day.label ?? "Holiday"})`
                  : null;
            return (
              <th
                key={day.date}
                scope="col"
                className={cn("border-b border-l border-line px-1 py-2.5 text-center align-middle", dayTint(day))}
                title={day.overtime ? "Overtime" : (day.label ?? undefined)}
              >
                <span className={cn("block text-label font-semibold", dayInk(day) || "text-foreground")}>{h.weekday}</span>
                <span className={cn("block text-micro", dayInk(day) || "text-muted-foreground")}>{h.day}</span>
                {note && (
                  <span className={cn("block max-w-full truncate text-micro font-medium", dayInk(day))}>
                    {note}
                    {day.overtime && <span className="sr-only"> overtime</span>}
                  </span>
                )}
              </th>
            );
          })}
          <th scope="col" className={cn(TH, "border-l text-right")}>
            Total
          </th>
          <th scope="col" className="border-b border-line">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => {
          const t = rowText(row);
          const label = t.key ? `${t.key} ${t.title}` : t.title;
          const rowKey = row.id ?? `row-${index}`;
          const hasNote = row.cells.some((c) => c.note);
          return (
            <tr
              key={rowKey}
              id={row.id ? rowDomId(row.id) : undefined}
              className={cn(
                "transition-colors duration-150",
                row.returnedReason ? "bg-warning/[0.06]" : "hover:bg-muted/40",
                highlightRowId !== null && highlightRowId === row.id && "bg-primary/[0.06]",
              )}
            >
              <td className="border-b border-line py-3 pl-5 pr-2 align-middle text-meta tabular-nums text-muted-foreground">
                {selectable && row.id ? (
                  <input
                    type="checkbox"
                    aria-label={`Return ${label}`}
                    checked={selected?.has(row.id) ?? false}
                    onChange={() => onToggleSelected?.(row.id!)}
                    className="h-4 w-4 rounded accent-primary"
                  />
                ) : (
                  index + 1
                )}
              </td>
              <td className="border-b border-line px-3 py-3 align-middle">
                <div className="flex min-w-0 items-center gap-3">
                  <RowIcon row={row} />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      {t.key && <span className="shrink-0 text-meta font-semibold text-foreground">{t.key}</span>}
                      <span className={cn("truncate text-meta text-foreground", t.key ? "font-medium" : "font-semibold")} title={t.title}>
                        {t.title}
                      </span>
                      {hasNote && <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Has notes" />}
                      {row.pinned && <Pin className="h-3.5 w-3.5 shrink-0 -rotate-45 text-muted-foreground" aria-label="Recurring" />}
                    </div>
                    <div className="mt-0.5 truncate text-micro text-muted-foreground">{t.sub}</div>
                    {row.returnedReason && (
                      <div className="mt-1 flex min-w-0 items-center gap-1.5 text-micro text-foreground">
                        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning-ink" aria-hidden />
                        <span className="truncate" title={row.returnedReason}>
                          <span className="font-semibold text-warning-ink">Returned:</span> {row.returnedReason}
                        </span>
                      </div>
                    )}
                    {row.activity?.requiresProject && !row.project && (
                      <div className="mt-0.5 text-micro font-medium text-danger-ink">Project required</div>
                    )}
                  </div>
                </div>
              </td>
              <td className="border-b border-line px-2 py-3 align-middle">
                <button
                  type="button"
                  disabled={!row.editable || !canOverrideBillable || !row.id || row.id.startsWith("pinned:")}
                  onClick={() => onToggleBillable?.(row)}
                  aria-label={`${label}: ${row.billable ? "billable" : "non-billable"}${row.editable && canOverrideBillable ? ", click to change" : ""}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-micro font-medium text-muted-foreground transition-colors",
                    row.editable && canOverrideBillable && "hover:bg-muted hover:text-foreground",
                  )}
                >
                  <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", row.billable ? "bg-success" : "bg-muted-foreground/40")} />
                  {row.billable ? "Billable" : "Non-billable"}
                </button>
              </td>
              {row.cells.map((cell) => {
                const day = days.find((d) => d.date === cell.date);
                return (
                  <td key={cell.date} className={cn("border-b border-l border-line px-1.5 py-1.5 align-middle", dayTint(day))}>
                    <TimesheetCell
                      rowId={row.id ?? rowKey}
                      cell={cell}
                      label={`${label}, ${dayLong(cell.date)}`}
                      overtime={Boolean(day?.overtime)}
                      editable={Boolean(canEdit && row.editable && day?.editable && row.id)}
                      onSave={(duration, note) => onSaveCell?.(row, cell.date, duration, note) ?? Promise.resolve(false)}
                    />
                  </td>
                );
              })}
              <td className="border-b border-l border-line px-3 py-3 text-right align-middle text-body font-semibold tabular-nums text-foreground">
                {minutesLabel(row.totalMinutes)}
              </td>
              <td className="border-b border-line pr-2 text-center align-middle">
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
          <td className="py-3.5 pl-5" />
          <td className="px-3 py-3.5 text-meta font-medium text-foreground" colSpan={2}>
            Total ({rows.length} {rows.length === 1 ? "item" : "items"})
          </td>
          {days.map((day) => (
            <td
              key={day.date}
              className={cn(
                "border-l border-line px-1 py-3.5 text-center text-body font-semibold tabular-nums",
                dayTint(day),
                day.overtime ? "text-danger-ink" : day.totalMinutes ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {minutesLabel(day.totalMinutes)}
            </td>
          ))}
          <td className="border-l border-line px-3 py-3.5 text-right text-body font-semibold tabular-nums text-foreground">
            {minutesLabel(weekTotal)}
          </td>
          <td />
        </tr>
      </tfoot>
    </table>
  );
}

// The shared menu item has no gap or disabled style; these keep the row menu
// readable and make an unavailable move visibly unavailable.
const ITEM =
  "h-9 gap-2.5 rounded-lg px-2.5 text-meta font-medium text-foreground data-[highlighted]:bg-primary/[0.08] data-[highlighted]:text-primary-ink data-[disabled]:pointer-events-none data-[disabled]:opacity-40";

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
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className={cn("w-52 rounded-xl p-1.5", GLASS)}>
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
            <div role="separator" className="mx-1 my-1 h-px bg-line" />
            <DropdownMenuItem
              className={cn(ITEM, "text-danger-ink data-[highlighted]:bg-destructive/[0.08] data-[highlighted]:text-danger-ink")}
              onSelect={() => onAction(row, "remove")}
            >
              <Trash2 className="h-4 w-4" /> Remove
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
