"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, TriangleAlert } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { formatDuration } from "@/features/time-tracking/lib/duration";
import { loadFraction } from "@/features/workload/lib/capacity";
import type {
  WorkloadDto,
  WorkloadIssueDto,
  WorkloadRowDto,
  WorkloadStatus,
} from "@/features/workload/types/workload.types";

// Status is carried by a label AND a colour, never colour alone (21_workload.md §5).
const STATUS_META: Record<WorkloadStatus, { label: string; dot: string; bar: string }> = {
  OVERLOADED: { label: "Overloaded", dot: "bg-destructive", bar: "bg-destructive" },
  BALANCED: { label: "Balanced", dot: "bg-accent", bar: "bg-accent" },
  LIGHT: { label: "Has room", dot: "bg-muted-foreground/60", bar: "bg-muted-foreground/50" },
  IDLE: { label: "No open work", dot: "bg-muted-foreground/30", bar: "bg-muted-foreground/20" },
};

function hours(minutes: number): string {
  return minutes === 0 ? "—" : formatDuration(minutes);
}

export function WorkloadView({ initial }: { initial: WorkloadDto }) {
  const [data, setData] = useState<WorkloadDto>(initial);
  const [loading, setLoading] = useState(false);

  const selectTeam = useCallback(async (teamId: string) => {
    setLoading(true);
    try {
      setData(await apiRequest<WorkloadDto>(`/api/workload?teamId=${teamId}`));
    } finally {
      setLoading(false);
    }
  }, []);

  if (data.teams.length === 0) {
    return (
      <div>
        <Header />
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          You don&apos;t manage a team yet. An admin can assign you as a team manager.
        </p>
      </div>
    );
  }

  const { totals } = data;

  return (
    <div>
      <Header />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <Select value={data.selectedTeamId ?? undefined} onValueChange={selectTeam}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a team" />
            </SelectTrigger>
            <SelectContent>
              {data.teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name} · {t.memberCount} {t.memberCount === 1 ? "person" : "people"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="People" value={String(totals.people)} />
        <Stat label="Open issues" value={String(totals.openIssues)} />
        <Stat label="Work remaining" value={hours(totals.remainingMinutes)} />
        <Stat label="Overloaded" value={String(totals.overloaded)} emphasise={totals.overloaded > 0} />
        <Stat label="No open work" value={String(totals.idle)} />
      </div>

      {totals.unestimated > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {totals.unestimated} open {totals.unestimated === 1 ? "issue has" : "issues have"} no
            estimate, so the totals below understate the real load. Estimates are set by a project
            lead on the issue.
          </span>
        </p>
      )}

      {data.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          This team has no members yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {data.rows.map((row) => (
            <PersonRow key={row.userId} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="mb-6">
      <h1 className="text-lg font-semibold text-foreground">Workload</h1>
      <p className="text-sm text-muted-foreground">
        Unfinished work queued against each person, across every project.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  emphasise = false,
}: {
  label: string;
  value: string;
  emphasise?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "text-lg font-semibold",
          emphasise ? "text-destructive" : "text-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function PersonRow({ row }: { row: WorkloadRowDto }) {
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState<WorkloadIssueDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meta = STATUS_META[row.status];

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (!next || issues) return;
    try {
      setIssues(await apiRequest<WorkloadIssueDto[]>(`/api/workload/users/${row.userId}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load their issues.");
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <Avatar className="h-8 w-8">
          {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt={row.name} />}
          <AvatarFallback className="text-xs">{row.name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{row.name}</span>
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} aria-hidden />
            <span className="text-xs text-muted-foreground">{meta.label}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn("h-full rounded-full", meta.bar)}
              style={{ width: `${loadFraction(row.weeksOfWork) * 100}%` }}
            />
          </div>
        </div>

        <div className="hidden w-28 shrink-0 text-right sm:block">
          <div className="text-sm font-medium text-foreground">{hours(row.remainingMinutes)}</div>
          <div className="text-xs text-muted-foreground">
            {row.weeksOfWork > 0 ? `${row.weeksOfWork} wk queued` : "nothing queued"}
          </div>
        </div>

        <div className="w-24 shrink-0 text-right">
          <div className="text-sm text-foreground">
            {row.openIssues} {row.openIssues === 1 ? "issue" : "issues"}
          </div>
          {row.unestimated > 0 && (
            <div className="text-xs text-muted-foreground">{row.unestimated} unestimated</div>
          )}
        </div>
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3">
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : !issues ? (
            <p className="text-sm text-muted-foreground">Loading issues…</p>
          ) : issues.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open issues.</p>
          ) : (
            <ul className="divide-y divide-border">
              {issues.map((i) => (
                <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                  <Link
                    href={`/projects/${i.projectId}/issues/${i.id}`}
                    className="font-mono text-xs text-accent hover:underline"
                  >
                    {i.key}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-foreground">{i.title}</span>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                    {i.projectKey}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {i.status.replace("_", " ").toLowerCase()}
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                    {i.estimateMinutes === null ? "no est." : hours(i.remainingMinutes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
