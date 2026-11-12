"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Layers, MessageSquareText, StickyNote } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/components/ui/popover";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import { parseDuration } from "@/features/time-tracking/lib/duration";
import { minutesInput, minutesLabel } from "@/features/timesheets/lib/format";
import { cn } from "@/shared/lib/utils";
import type { TimesheetCellDto } from "@/features/timesheets/types/timesheet.types";

// One day of one row (37_timesheets BR-5–BR-9). Click or type to edit; Enter
// or leaving the cell saves; Escape cancels. The duration is checked with the
// same parser the server uses, so a typo is caught before the round trip.

export function cellDomId(rowId: string, date: string): string {
  return `ts-cell-${rowId.replace(/[^a-zA-Z0-9_-]/g, "_")}-${date}`;
}

export function TimesheetCell({
  rowId,
  cell,
  label,
  editable,
  issueHref,
  onSave,
}: {
  rowId: string;
  cell: TimesheetCellDto;
  label: string;
  editable: boolean;
  issueHref: string | null;
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
          className={cn(
            "h-8 w-full rounded-md border bg-background px-1.5 text-center text-meta tabular-nums text-foreground outline-none",
            error ? "border-destructive ring-1 ring-destructive" : "border-primary ring-1 ring-primary",
          )}
          value={draft}
          inputMode="decimal"
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
          <p role="alert" className="absolute left-0 top-full z-10 mt-1 w-44 rounded-md border border-destructive/30 bg-background px-2 py-1 text-micro text-destructive">
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
            className="flex h-8 w-full items-center justify-center gap-1 rounded-md text-meta tabular-nums text-foreground hover:bg-muted"
          >
            {minutesLabel(cell.minutes)}
            <Layers className="h-3 w-3 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 text-meta">
          <p className="text-foreground">
            {cell.logCount} separate entries add up to {minutesLabel(cell.minutes)} here.
          </p>
          <p className="mt-1 text-muted-foreground">
            Edit them one by one on the issue, so nothing is merged by accident.
          </p>
          {issueHref && (
            <Link href={issueHref} className="mt-2 inline-block font-medium text-primary hover:underline">
              Open the issue
            </Link>
          )}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="group relative">
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
          "flex h-8 w-full items-center justify-center gap-1 rounded-md text-meta tabular-nums",
          cell.minutes ? "text-foreground" : "text-muted-foreground",
          editable && "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          missingNote && "border border-destructive bg-destructive/5",
          !editable && "cursor-default",
        )}
      >
        {minutesLabel(cell.minutes)}
        {missingNote && <StickyNote className="h-3 w-3 text-destructive" aria-hidden />}
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
              className="absolute right-0 top-0 flex h-3.5 w-3.5 items-start justify-end rounded-tr-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {cell.note && (
                <span aria-hidden className="h-0 w-0 border-l-[7px] border-t-[7px] border-l-transparent border-t-primary group-hover:hidden" />
              )}
              <MessageSquareText
                aria-hidden
                className={cn(
                  "h-3 w-3 text-muted-foreground",
                  cell.note ? "hidden text-primary group-hover:block" : "opacity-0 group-hover:opacity-100",
                )}
              />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <label className="text-label text-foreground" htmlFor={`${cellDomId(rowId, cell.date)}-note`}>
              Note{cell.noteRequired ? " (required)" : ""}
            </label>
            <Textarea
              id={`${cellDomId(rowId, cell.date)}-note`}
              className="mt-1.5 min-h-20 text-meta"
              maxLength={1000}
              value={noteDraft}
              readOnly={!editable}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            {editable && (
              <div className="mt-2 flex justify-end gap-1.5">
                <Button variant="ghost" size="sm" onClick={() => setNoteOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={async () => {
                    const ok = await onSave(minutesInput(cell.minutes), noteDraft.trim() || null);
                    if (ok) setNoteOpen(false);
                  }}
                >
                  Save note
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
