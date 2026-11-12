"use client";

import { useEffect, useRef, useState } from "react";
import { FileWarning, Layers, MessageSquareText } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Textarea } from "@/shared/components/ui/textarea";
import { parseDuration } from "@/features/time-tracking/lib/duration";
import { minutesInput, minutesLabel } from "@/features/timesheets/lib/format";
import { GLASS } from "@/features/timesheets/components/timesheet-parts";
import { cn } from "@/shared/lib/utils";
import type { TimesheetCellDto } from "@/features/timesheets/types/timesheet.types";

// One day of one row (37_timesheets BR-5–BR-9). Click or type to edit; Enter
// or leaving the cell saves; Escape cancels. The duration is checked with the
// same parser the server uses, so a typo is caught before the round trip.

export function cellDomId(rowId: string, date: string): string {
  return `ts-cell-${rowId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${date}`;
}

const BOX = "flex h-10 w-full items-center justify-center gap-1.5 rounded-lg text-body tabular-nums";

export function TimesheetCell({
  rowId,
  cell,
  label,
  editable,
  overtime,
  onSave,
}: {
  rowId: string;
  cell: TimesheetCellDto;
  label: string;
  editable: boolean;
  overtime: boolean;
  onSave: (duration: string, note?: string | null) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(cell.note ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const multiple = cell.logCount > 1;
  const missingNote = cell.noteRequired && cell.minutes > 0 && !cell.note;
  const valueTone = cell.minutes
    ? overtime
      ? "font-semibold text-danger-ink"
      : "font-medium text-foreground"
    : "text-muted-foreground";

  async function commit() {
    const raw = draft.trim();
    if (raw === minutesInput(cell.minutes)) {
      setEditing(false);
      return;
    }
    if (parseDuration(raw === "" ? "0" : raw) === null) {
      setError("Use 1:30, 1.5, 1h 30m or 90m (up to 24h)");
      return;
    }
    setError(null);
    setEditing(false);
    await onSave(raw === "" ? "0" : raw);
  }

  if (editing) {
    return (
      <div className="relative">
        <input
          ref={inputRef}
          id={cellDomId(rowId, cell.date)}
          aria-label={`${label}, hours`}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${cellDomId(rowId, cell.date)}-error` : undefined}
          className={cn(
            "h-10 w-full rounded-lg border bg-background px-2 text-center text-body font-medium tabular-nums text-foreground outline-none ring-2 transition-shadow",
            error ? "border-destructive ring-destructive/25" : "border-primary ring-primary/20",
          )}
          value={draft}
          inputMode="decimal"
          placeholder="0:00"
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              setEditing(false);
              setError(null);
            }
          }}
        />
        {error && (
          <p
            id={`${cellDomId(rowId, cell.date)}-error`}
            role="alert"
            className={cn("absolute left-1/2 top-full z-20 mt-1.5 w-48 -translate-x-1/2 rounded-lg px-2.5 py-1.5 text-micro text-danger-ink", GLASS)}
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  if (multiple) {
    // BR-8: several logs in one cell are edited one by one, never merged.
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            id={cellDomId(rowId, cell.date)}
            type="button"
            aria-label={`${label}: ${minutesLabel(cell.minutes)} across ${cell.logCount} entries`}
            className={cn(BOX, valueTone, "hover:bg-background hover:ring-1 hover:ring-line")}
          >
            {minutesLabel(cell.minutes)}
            <Layers className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className={cn("w-64 rounded-xl p-4 text-meta", GLASS)}>
          <p className="font-semibold text-foreground">
            {cell.logCount} entries · {minutesLabel(cell.minutes)}
          </p>
          <p className="mt-1 text-muted-foreground">
            These were logged separately (for example from the issue page). Edit them one by one there, so nothing is
            merged by accident.
          </p>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="group/cell relative">
      <button
        id={cellDomId(rowId, cell.date)}
        type="button"
        disabled={!editable}
        aria-label={`${label}: ${cell.minutes ? minutesLabel(cell.minutes) : "empty"}${missingNote ? ", note required" : ""}`}
        onClick={() => {
          setDraft(minutesInput(cell.minutes));
          setEditing(true);
        }}
        onKeyDown={(e) => {
          if (/^[0-9.:]$/.test(e.key)) {
            e.preventDefault();
            setDraft(e.key);
            setEditing(true);
          }
        }}
        className={cn(
          BOX,
          valueTone,
          "transition-[background-color,box-shadow] duration-150",
          editable && "cursor-text hover:bg-background hover:ring-1 hover:ring-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          missingNote && "bg-background ring-1 ring-destructive hover:ring-destructive",
          !editable && "cursor-default",
        )}
      >
        {missingNote && <FileWarning className="h-4 w-4 shrink-0 text-danger-ink" aria-hidden />}
        {minutesLabel(cell.minutes)}
      </button>

      {cell.minutes > 0 && (editable || cell.note) && (
        <Popover
          open={noteOpen}
          onOpenChange={(open) => {
            setNoteOpen(open);
            if (open) setNoteDraft(cell.note ?? "");
          }}
        >
          <PopoverTrigger asChild>
            {/* A corner marker when a note exists (it never covers the
                duration); the note button itself appears on hover/focus. */}
            <button
              type="button"
              aria-label={cell.note ? `${label}: note — ${cell.note}` : `${label}: add a note`}
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-start justify-end rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {cell.note && (
                <span aria-hidden className="mr-0.5 mt-0.5 h-0 w-0 border-l-[7px] border-t-[7px] border-l-transparent border-t-primary group-hover/cell:hidden" />
              )}
              <MessageSquareText
                aria-hidden
                className={cn(
                  "h-3.5 w-3.5",
                  cell.note ? "hidden text-primary-ink group-hover/cell:block" : "text-muted-foreground opacity-0 group-hover/cell:opacity-100",
                )}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className={cn("w-80 rounded-xl p-4", GLASS)}>
            <label className="text-label font-semibold text-foreground" htmlFor={`${cellDomId(rowId, cell.date)}-note`}>
              Note{cell.noteRequired ? " · required" : ""}
            </label>
            <Textarea
              id={`${cellDomId(rowId, cell.date)}-note`}
              className="mt-2 min-h-24 rounded-lg border-line bg-background text-meta"
              maxLength={1000}
              placeholder="What was this time spent on?"
              value={noteDraft}
              readOnly={!editable}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            {editable && (
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className="h-8 rounded-lg px-3 text-meta font-medium text-foreground hover:bg-muted" onClick={() => setNoteOpen(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="h-8 rounded-lg bg-primary-ink px-3 text-meta font-semibold text-white hover:bg-primary-ink/90"
                  onClick={async () => {
                    const ok = await onSave(minutesInput(cell.minutes), noteDraft.trim() || null);
                    if (ok) setNoteOpen(false);
                  }}
                >
                  Save note
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
