"use client";

import { useCallback, useMemo, useState } from "react";
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
import {
  Chart,
  capacityBarsHeight,
  capacityBarsOption,
  capacityBarsSummary,
  distributionBarOption,
  distributionBarSummary,
  type CapacityBar,
  type CapacityReference,
  type ChartTheme,
  type ChartTone,
  type DistributionSegment,
} from "@/shared/components/charts";
import { formatDuration } from "@/features/time-tracking/lib/duration";
import { LIGHT_WEEKS, OVERLOADED_WEEKS } from "@/features/workload/lib/capacity";
import { WorkloadGrid } from "@/features/workload/components/workload-grid";
import type {
  WorkloadDto,
  WorkloadIssueDto,
  WorkloadRowDto,
  WorkloadStatus,
} from "@/features/workload/types/workload.types";

// Status is carried by a label AND a colour, never colour alone (21_workload.md §5).
// `tone` is the same meaning expressed for the canvas, so a status is never one
// colour in a chart and a different one in a row.
const STATUS_META: Record<WorkloadStatus, { label: string; dot: string; tone: ChartTone }> = {
  OVERLOADED: { label: "Overloaded", dot: "bg-destructive", tone: "danger" },
  BALANCED: { label: "Balanced", dot: "bg-accent", tone: "accent" },
  LIGHT: { label: "Has room", dot: "bg-success", tone: "success" },
  IDLE: { label: "No open work", dot: "bg-muted-foreground/40", tone: "neutral" },
};

// Most urgent first — the whole point of the page is spotting the top group.
const SECTION_ORDER: WorkloadStatus[] = ["OVERLOADED", "BALANCED", "LIGHT", "IDLE"];

// The band edges from BR-6, drawn on the chart so the colours are explained by
// the axis rather than only by the legend.
const CAPACITY_REFERENCES: CapacityReference[] = [
  { weeks: LIGHT_WEEKS, label: `${LIGHT_WEEKS} wk` },
  { weeks: OVERLOADED_WEEKS, label: `${OVERLOADED_WEEKS} wk` },
];

function hours(minutes: number): string {
  return minutes === 0 ? "—" : formatDuration(minutes);
}

function rowCaption(row: WorkloadRowDto): string {
  if (row.openIssues === 0) return "no open work";
  return `${hours(row.remainingMinutes)} · ${row.openIssues} ${
    row.openIssues === 1 ? "issue" : "issues"
  }`;
}

// Two questions, two views of one service call: the list answers "who is
// overloaded", the grid answers "when" (ADR-0035). The list stays the default.
type ViewMode = "list" | "grid";

export function WorkloadView({ initial }: { initial: WorkloadDto }) {
  const [data, setData] = useState<WorkloadDto>(initial);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ViewMode>("list");

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
        <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="View">
          <ModeButton current={mode} value="list" onSelect={setMode}>
            By person
          </ModeButton>
          <ModeButton current={mode} value="grid" onSelect={setMode}>
            By week
          </ModeButton>
        </div>
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="People" value={String(totals.people)} />
        <Stat label="Open issues" value={String(totals.openIssues)} />
        <Stat label="Work remaining" value={hours(totals.remainingMinutes)} />
        <Stat label="Overloaded" value={String(totals.overloaded)} emphasise={totals.overloaded > 0} />
      </div>

      {totals.unestimated > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {totals.unestimated} of these {totals.openIssues} open issues have no estimate, so the
            figures below understate the real load.
          </span>
        </p>
      )}

      {data.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          This team has no members yet.
        </p>
      ) : mode === "grid" ? (
        <WorkloadGrid grid={data.grid} workingWeek={data.workingWeek} />
      ) : (
        <>
          <TeamCharts rows={data.rows} />

          {/* Grouped by status so the eye lands on the people who need attention
              instead of scanning 17 near-identical rows. */}
          <div className="flex flex-col gap-5">
            {SECTION_ORDER.map((status) => {
              const rows = data.rows.filter((r) => r.status === status);
              if (rows.length === 0) return null;
              return (
                <section key={status}>
                  <h2 className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[status].dot)} aria-hidden />
                    {STATUS_META[status].label}
                    <span className="font-normal normal-case">({rows.length})</span>
                  </h2>
                  <div className="flex flex-col gap-2">
                    {rows.map((row) => (
                      <PersonRow key={row.userId} row={row} />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Based on a {data.workingWeek.label}. Two of those weeks queued counts as overloaded.
            An admin can change it in Admin → Organization.
          </p>
        </>
      )}
    </div>
  );
}

function ModeButton({
  current,
  value,
  onSelect,
  children,
}: {
  current: ViewMode;
  value: ViewMode;
  onSelect: (mode: ViewMode) => void;
  children: React.ReactNode;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-pressed={active}
      className={cn(
        "rounded-md px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// The shape of the team, then every person on one comparable axis. Reading
// beats scanning: the mini bars these replace had no ticks, so "how full" was
// unanswerable and two people in different status groups could not be compared
// (docs/05_UI/03_Data_Visualisation.md §7, backlog UI-2).
function TeamCharts({ rows }: { rows: WorkloadRowDto[] }) {
  const segments: DistributionSegment[] = useMemo(
    () =>
      SECTION_ORDER.map((status) => ({
        key: status,
        label: STATUS_META[status].label,
        count: rows.filter((r) => r.status === status).length,
        tone: STATUS_META[status].tone,
      })),
    [rows],
  );

  // Already sorted most-loaded first by the service (BR-10); the chart keeps
  // that order so it reads in the same sequence as the rows beneath it.
  const bars: CapacityBar[] = useMemo(
    () =>
      rows.map((row) => ({
        key: row.userId,
        label: row.name,
        weeks: row.weeksOfWork,
        tone: STATUS_META[row.status].tone,
        caption: rowCaption(row),
      })),
    [rows],
  );

  const mixOption = useCallback(
    (theme: ChartTheme) => distributionBarOption(segments, theme),
    [segments],
  );
  const barsOption = useCallback(
    (theme: ChartTheme) => capacityBarsOption(bars, CAPACITY_REFERENCES, theme),
    [bars],
  );

  return (
    <div className="mb-5 flex flex-col gap-4">
      <section className="rounded-lg border border-border bg-background px-4 py-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Team mix
        </h2>
        <Chart
          buildOption={mixOption}
          height={78}
          summary={distributionBarSummary(segments, "people")}
        />
      </section>

      <section className="rounded-lg border border-border bg-background px-4 py-3">
        <h2 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Weeks queued per person
        </h2>
        <Chart
          buildOption={barsOption}
          height={capacityBarsHeight(bars.length)}
          summary={capacityBarsSummary(bars)}
        />
      </section>
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

        {/* Status is the section heading, and the load bar now lives in the
            chart above, so the row carries the name and the two figures only. */}
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {row.name}
        </span>

        <div className="w-36 shrink-0 text-right">
          <div className="text-sm font-medium text-foreground">
            {row.openIssues === 0 ? "—" : `${row.weeksOfWork} wk`}
          </div>
          <div className="text-xs text-muted-foreground">{rowCaption(row)}</div>
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
