"use client";

import { useState } from "react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { parseDuration, formatDuration } from "@/features/time-tracking/lib/duration";
import type {
  TimeSummaryDto,
  WorkLogDto,
  WorkLogPageDto,
} from "@/features/time-tracking/types/time-tracking.types";

const TODAY = () => new Date().toISOString().slice(0, 10);

// Time Tracking panel on the issue detail page (19_time_tracking.md). Estimate
// vs logged vs remaining, a log-time form, and the editable log list. Writers
// (MEMBER/LEAD) can log/estimate; VIEWER sees read-only.
export function TimeTrackingPanel({
  issueId,
  initial,
}: {
  issueId: string;
  initial: WorkLogPageDto;
}) {
  const [items, setItems] = useState<WorkLogDto[]>(initial.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initial.nextCursor);
  const [summary, setSummary] = useState<TimeSummaryDto>(initial.summary);
  const [loadingMore, setLoadingMore] = useState(false);

  // Refetch the first page after any mutation so the summary (Σ) stays exact.
  async function reload() {
    try {
      const page = await apiRequest<WorkLogPageDto>(`/api/issues/${issueId}/worklogs`);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setSummary(page.summary);
    } catch {
      /* a reload failure leaves the last-known state; next action retries */
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await apiRequest<WorkLogPageDto>(
        `/api/issues/${issueId}/worklogs?cursor=${encodeURIComponent(nextCursor)}`,
      );
      setItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load more logs.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-foreground">Time tracking</h2>

      <div className="rounded-lg border border-border bg-background p-4">
        <SummaryBar
          summary={summary}
          canEdit={initial.canSetEstimate}
          issueId={issueId}
          onEstimate={setSummary}
        />

        {initial.canLog && <LogForm issueId={issueId} onLogged={reload} />}

        <div className="mt-4 flex flex-col divide-y divide-border">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">No time logged yet.</p>
          )}
          {items.map((log) => (
            <LogRow key={log.id} log={log} onChanged={reload} />
          ))}
        </div>

        {nextCursor && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load older logs"}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryBar({
  summary,
  canEdit,
  issueId,
  onEstimate,
}: {
  summary: TimeSummaryDto;
  canEdit: boolean;
  issueId: string;
  onEstimate: (s: TimeSummaryDto) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const { estimateMinutes, loggedMinutes, remainingMinutes } = summary;
  const over = estimateMinutes !== null && loggedMinutes > estimateMinutes;
  const pct =
    estimateMinutes && estimateMinutes > 0
      ? Math.min(100, Math.round((loggedMinutes / estimateMinutes) * 100))
      : loggedMinutes > 0
        ? 100
        : 0;

  async function saveEstimate() {
    if (busy) return;
    const trimmed = draft.trim();
    let estimate: number | null;
    if (trimmed === "") {
      estimate = null; // clear
    } else {
      const parsed = parseDuration(trimmed);
      if (parsed === null) {
        toast.error('Enter a duration like "1h 30m", "90m", or leave blank to clear.');
        return;
      }
      estimate = parsed;
    }
    setBusy(true);
    try {
      const next = await apiRequest<TimeSummaryDto>(`/api/issues/${issueId}/estimate`, {
        method: "PUT",
        body: { estimateMinutes: estimate },
      });
      onEstimate(next);
      setEditing(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the estimate.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <Metric label="Estimate" value={estimateMinutes === null ? "—" : formatDuration(estimateMinutes)} />
        <Metric label="Logged" value={formatDuration(loggedMinutes)} />
        <Metric
          label={over ? "Over by" : "Remaining"}
          value={
            remainingMinutes === null
              ? "—"
              : formatDuration(Math.abs(remainingMinutes))
          }
          tone={over ? "over" : "normal"}
        />
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(estimateMinutes === null ? "" : formatDuration(estimateMinutes));
              setEditing(true);
            }}
            className="text-xs text-muted-foreground hover:text-foreground focus-visible:underline focus-visible:outline-none"
          >
            {estimateMinutes === null ? "Set estimate" : "Edit estimate"}
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            aria-label="Estimate"
            placeholder='e.g. "1h 30m" (blank to clear)'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8 max-w-[200px]"
          />
          <Button size="sm" onClick={saveEstimate} loading={busy}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
        </div>
      )}

      {(estimateMinutes !== null || loggedMinutes > 0) && (
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className={over ? "h-full bg-destructive" : "h-full bg-accent"}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "over";
}) {
  return (
    <span className="inline-flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-medium ${tone === "over" ? "text-destructive" : "text-foreground"}`}>
        {value}
      </span>
    </span>
  );
}

function LogForm({ issueId, onLogged }: { issueId: string; onLogged: () => void }) {
  const [duration, setDuration] = useState("");
  const [date, setDate] = useState(TODAY());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const minutes = parseDuration(duration);
    if (minutes === null) {
      toast.error('Enter a duration like "1h 30m", "90m", or "1.5h".');
      return;
    }
    if (minutes > 1440) {
      toast.error("A single log can't exceed 24 hours.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/api/issues/${issueId}/worklogs`, {
        method: "POST",
        body: { minutes, workDate: date, note: note.trim() || undefined },
      });
      setDuration("");
      setNote("");
      setDate(TODAY());
      onLogged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't log time.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Duration
        <Input
          aria-label="Duration"
          placeholder="1h 30m"
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className="h-8 w-28"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Date
        <Input
          aria-label="Work date"
          type="date"
          value={date}
          max={TODAY()}
          onChange={(e) => setDate(e.target.value)}
          className="h-8 w-40"
        />
      </label>
      <label className="flex flex-1 flex-col gap-1 text-xs text-muted-foreground">
        Note (optional)
        <Input
          aria-label="Note"
          placeholder="What did you work on?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="h-8"
        />
      </label>
      <Button size="sm" onClick={submit} loading={busy} disabled={!duration.trim()}>
        Log time
      </Button>
    </div>
  );
}

function LogRow({ log, onChanged }: { log: WorkLogDto; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [duration, setDuration] = useState(formatDuration(log.minutes));
  const [date, setDate] = useState(log.workDate);
  const [note, setNote] = useState(log.note ?? "");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    const minutes = parseDuration(duration);
    if (minutes === null) {
      toast.error("Enter a valid duration.");
      return;
    }
    setBusy(true);
    try {
      await apiRequest(`/api/worklogs/${log.id}`, {
        method: "PATCH",
        body: { minutes, workDate: date, note: note.trim() || undefined, expectedVersion: log.version },
      });
      setEditing(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the edit.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    try {
      await apiRequest(`/api/worklogs/${log.id}`, { method: "DELETE" });
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the log.");
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-3 py-2.5">
      <Avatar className="h-7 w-7 shrink-0">
        {log.user.avatarUrl && <AvatarImage src={log.user.avatarUrl} alt={log.user.name} />}
        <AvatarFallback className="text-[11px]">
          {log.user.name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-wrap items-end gap-2">
            <Input aria-label="Duration" value={duration} onChange={(e) => setDuration(e.target.value)} className="h-8 w-24" />
            <Input aria-label="Work date" type="date" value={date} max={TODAY()} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" />
            <Input aria-label="Note" value={note} onChange={(e) => setNote(e.target.value)} className="h-8 flex-1" placeholder="Note" />
            <Button size="sm" onClick={save} loading={busy}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium text-foreground">{formatDuration(log.minutes)}</span>
              <span className="text-xs text-muted-foreground">
                {log.user.name} · {new Date(`${log.workDate}T00:00:00`).toLocaleDateString()}
              </span>
            </div>
            {log.note && <p className="mt-0.5 break-words text-sm text-muted-foreground">{log.note}</p>}
            {(log.canEdit || log.canDelete) && (
              <div className="mt-1 flex gap-3 text-xs">
                {log.canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setDuration(formatDuration(log.minutes));
                      setDate(log.workDate);
                      setNote(log.note ?? "");
                      setEditing(true);
                    }}
                    className="text-muted-foreground hover:text-foreground focus-visible:underline focus-visible:outline-none"
                  >
                    Edit
                  </button>
                )}
                {log.canDelete && (
                  <button
                    type="button"
                    onClick={remove}
                    disabled={busy}
                    className="text-muted-foreground hover:text-destructive focus-visible:underline focus-visible:outline-none"
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
