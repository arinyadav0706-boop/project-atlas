"use client";

import { useEffect, useState } from "react";
import { Briefcase, Search, SquareCheckBig, Star } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { timesheetApi } from "@/features/timesheets/api/timesheet-api";
import { cn } from "@/shared/lib/utils";
import { GLASS } from "@/features/timesheets/components/timesheet-parts";
import type {
  ActivityOptionDto,
  ActivityPickerDto,
  TimesheetIssueOptionDto,
} from "@/features/timesheets/types/timesheet.types";

// Add row (37_timesheets BR-21, BR-22): an issue — suggested from what is
// assigned to me or already worked this week, or searched — or an activity,
// grouped by category with favourites and recents.

export type AddRowKind = "ISSUE" | "ACTIVITY";

export function AddRowDialog({
  open,
  kind,
  periodStart,
  projects,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  kind: AddRowKind;
  periodStart: string;
  projects: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
  onAdd: (input: { issueId?: string; activityId?: string; projectId?: string | null }) => Promise<boolean>;
}) {
  const [q, setQ] = useState("");
  const [issues, setIssues] = useState<{ suggested: TimesheetIssueOptionDto[]; results: TimesheetIssueOptionDto[] }>({ suggested: [], results: [] });
  const [activities, setActivities] = useState<ActivityPickerDto | null>(null);
  const [chosen, setChosen] = useState<ActivityOptionDto | null>(null);
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);

  // Debounced search: one request per pause, not per keystroke.
  useEffect(() => {
    if (!open) return;
    const handle = setTimeout(() => {
      const request =
        kind === "ISSUE"
          ? timesheetApi.issueOptions(periodStart, q.trim()).then(setIssues)
          : timesheetApi.activityOptions(q.trim()).then(setActivities);
      request.catch((e: Error) => toast.error(e.message));
    }, 200);
    return () => clearTimeout(handle);
  }, [open, kind, q, periodStart]);

  async function add(input: { issueId?: string; activityId?: string; projectId?: string | null }) {
    setBusy(true);
    const ok = await onAdd(input);
    setBusy(false);
    if (ok) onOpenChange(false);
  }

  async function toggleFavourite(a: ActivityOptionDto) {
    try {
      await timesheetApi.setFavourite(a.id, !a.favourite);
      setActivities(await timesheetApi.activityOptions(q.trim()));
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const issueList = q.trim() ? issues.results : issues.suggested;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-w-lg rounded-2xl p-6", GLASS)}>
        <DialogTitle>{kind === "ISSUE" ? "Add an issue" : "Add an activity"}</DialogTitle>
        <DialogDescription>
          {kind === "ISSUE"
            ? "Issues assigned to you, or that you worked on this week, come first."
            : "Meetings, client calls, HR and other work that isn't an issue."}
        </DialogDescription>

        {chosen ? (
          <div className="mt-4 space-y-3">
            <p className="text-meta text-foreground">
              <span className="font-medium">{chosen.name}</span>
              {chosen.requiresProject ? " needs a project." : " — tag a project if it was for one (optional)."}
            </p>
            <label className="block text-label text-foreground" htmlFor="ts-add-project">
              Project{chosen.requiresProject ? "" : " (optional)"}
            </label>
            <select
              id="ts-add-project"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-meta text-foreground"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setChosen(null)}>
                Back
              </Button>
              <Button
                loading={busy}
                disabled={chosen.requiresProject && !projectId}
                onClick={() => void add({ activityId: chosen.id, projectId: projectId || null })}
              >
                Add row
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                autoFocus
                aria-label={kind === "ISSUE" ? "Search issues by key or title" : "Search activities"}
                placeholder={kind === "ISSUE" ? "Search by key or title" : "Search activities"}
                className="pl-8"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="mt-3 max-h-80 overflow-y-auto scroll-fade">
              {kind === "ISSUE" ? (
                issueList.length === 0 ? (
                  <p className="px-1 py-6 text-center text-meta text-muted-foreground">
                    {q.trim() ? "No issues match." : "Nothing assigned to you yet — search for an issue."}
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {issueList.map((i) => (
                      <li key={i.id}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void add({ issueId: i.id })}
                          className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <SquareCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate text-meta text-foreground">
                              <span className="mr-1.5 text-micro font-medium text-muted-foreground">{i.key}</span>
                              {i.title}
                            </span>
                            <span className="block text-micro text-muted-foreground">
                              {i.projectName}
                              {i.reason === "ASSIGNED" ? " · assigned to you" : i.reason === "WORKED_THIS_PERIOD" ? " · worked this week" : ""}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              ) : !activities ? (
                <p className="px-1 py-6 text-center text-meta text-muted-foreground">Loading…</p>
              ) : (
                <div className="space-y-3">
                  {!q.trim() && activities.favourites.length > 0 && (
                    <ActivityGroup title="Favourites" items={activities.favourites} onPick={setChosen} onStar={toggleFavourite} />
                  )}
                  {!q.trim() && activities.recents.length > 0 && (
                    <ActivityGroup title="Recent" items={activities.recents} onPick={setChosen} onStar={toggleFavourite} />
                  )}
                  {activities.categories.map((c) => (
                    <ActivityGroup key={c.id} title={c.name} items={c.activities} onPick={setChosen} onStar={toggleFavourite} />
                  ))}
                  {activities.categories.length === 0 && (
                    <p className="px-1 py-6 text-center text-meta text-muted-foreground">No activities match.</p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ActivityGroup({
  title,
  items,
  onPick,
  onStar,
}: {
  title: string;
  items: ActivityOptionDto[];
  onPick: (a: ActivityOptionDto) => void;
  onStar: (a: ActivityOptionDto) => void;
}) {
  return (
    <section>
      <h3 className="px-2 pb-1 text-micro font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="space-y-0.5">
        {items.map((a) => (
          <li key={`${title}-${a.id}`} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onPick(a)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Briefcase className="h-4 w-4 shrink-0 text-warning" aria-hidden />
              <span className="truncate text-meta text-foreground">{a.name}</span>
              {(a.requiresProject || a.notesRequired) && (
                <span className="ml-auto shrink-0 text-micro text-muted-foreground">
                  {[a.requiresProject && "project", a.notesRequired && "note"].filter(Boolean).join(" · ")} required
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label={a.favourite ? `Remove ${a.name} from favourites` : `Add ${a.name} to favourites`}
              aria-pressed={a.favourite}
              onClick={() => onStar(a)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Star className={cn("h-3.5 w-3.5", a.favourite && "fill-warning text-warning")} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
