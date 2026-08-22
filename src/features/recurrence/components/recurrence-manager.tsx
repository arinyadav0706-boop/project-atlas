"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Switch } from "@/shared/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import type { RecurrenceDto, RecurrencesDto } from "@/features/recurrence/types/recurrence.types";
import {
  blankRecurrence,
  fromDto,
  RecurrenceBuilder,
  type RecurrenceFormValue,
} from "@/features/recurrence/components/recurrence-builder";

// Recurring work in project settings (32_recurring.md §6).
//
// The list leads with the next run date, because the one failure mode this
// module has that nothing else does is silence: if the scheduler stops, a
// recurrence produces nothing and says nothing. A visibly stale "next run" is
// the only symptom, so it is the most prominent thing on the row (REC-4).

function whenText(iso: string | null, timeZone: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function RecurrenceManager({
  projectId,
  members,
}: {
  projectId: string;
  members: { userId: string; name: string }[];
}) {
  const [data, setData] = useState<RecurrencesDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; value: RecurrenceFormValue } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<RecurrenceDto | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiRequest<RecurrencesDto>(`/api/projects/${projectId}/recurrences`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load recurring work.");
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const mutate = useCallback(
    async (fn: () => Promise<unknown>, success: string) => {
      setBusy(true);
      try {
        await fn();
        await load();
        toast.success(success);
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That didn't work.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  if (!data) {
    return (
      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Loading recurring work…
      </p>
    );
  }

  const { items, canManage } = data;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-[13px] text-muted-foreground">
          {items.length === 0
            ? "Nothing repeats yet."
            : `${items.length} schedule${items.length === 1 ? "" : "s"}, ${items.filter((i) => i.active).length} active.`}
        </p>
        {canManage && (
          <Button
            size="sm"
            className="ml-auto"
            onClick={() => setEditing({ id: null, value: blankRecurrence() })}
          >
            <Plus className="mr-1 size-3.5" />
            New schedule
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <Repeat className="mx-auto mb-2 size-5 text-muted-foreground" />
          <p className="text-[13px] font-medium text-foreground">
            Stop re-typing the same ticket
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
            Standups, weekly reports, the monthly access review. A schedule creates a
            fresh issue each time — so each one keeps its own history and its own
            cycle time, rather than one ticket being reopened forever.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((r) => (
            <li
              key={r.id}
              className={cn(
                "rounded-xl border border-border bg-background p-3",
                !r.active && "opacity-60",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {r.name}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {r.summary}
                    </span>
                    {r.lastError && (
                      <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
                        <AlertTriangle className="size-3" />
                        Last run failed
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.active ? (
                      <>
                        Next <span className="text-foreground">{whenText(r.nextRunAt, r.timeZone)}</span>
                        {r.timeZone !== "UTC" && ` · ${r.timeZone}`}
                      </>
                    ) : (
                      "Paused"
                    )}
                    {r.occurrences > 0 &&
                      ` · created ${r.occurrences} issue${r.occurrences === 1 ? "" : "s"}`}
                  </p>
                  {r.lastError && (
                    <p className="mt-1 text-xs text-destructive">{r.lastError}</p>
                  )}
                  {r.recentIssues.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                      {r.recentIssues.map((issue) => (
                        <Link
                          key={issue.id}
                          href={`/projects/${projectId}/issues/${issue.id}`}
                          className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                        >
                          {issue.key}
                        </Link>
                      ))}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <Switch
                      checked={r.active}
                      disabled={busy}
                      aria-label={`${r.active ? "Pause" : "Resume"} ${r.name}`}
                      onCheckedChange={(active) =>
                        void mutate(
                          () =>
                            apiRequest(`/api/projects/${projectId}/recurrences/${r.id}`, {
                              method: "PATCH",
                              body: { active },
                            }),
                          active ? "Schedule resumed." : "Schedule paused.",
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Edit ${r.name}`}
                      onClick={() => setEditing({ id: r.id, value: fromDto(r) })}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Delete ${r.name}`}
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <RecurrenceBuilder
          key={editing.id ?? "new"}
          open
          editing={editing.value}
          members={members}
          saving={busy}
          onClose={() => setEditing(null)}
          onSave={(value) => {
            const target = editing.id;
            void mutate(
              () =>
                target
                  ? apiRequest(`/api/projects/${projectId}/recurrences/${target}`, {
                      method: "PATCH",
                      body: value,
                    })
                  : apiRequest(`/api/projects/${projectId}/recurrences`, {
                      method: "POST",
                      body: value,
                    }),
              target ? "Schedule updated." : "Schedule created.",
            ).then((ok) => ok && setEditing(null));
          }}
        />
      )}

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="w-[min(440px,94vw)]">
          <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
          <DialogDescription>
            It stops immediately. The issues it already created are untouched — pausing
            it instead keeps the schedule editable.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => {
                const target = deleting;
                if (!target) return;
                void mutate(
                  () =>
                    apiRequest(`/api/projects/${projectId}/recurrences/${target.id}`, {
                      method: "DELETE",
                    }),
                  "Schedule deleted.",
                ).then((ok) => ok && setDeleting(null));
              }}
            >
              Delete schedule
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
