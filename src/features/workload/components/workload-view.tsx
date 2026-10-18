"use client";

import { useCallback, useState } from "react";
import { Activity, BarChart3, Smile, Users, Sparkles } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { AppFrame } from "@/shared/components/ui/app-frame";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { WorkloadGrid } from "@/features/workload/components/workload-grid";
import { CapacityCard } from "@/features/workload/components/capacity-card";
import { PeopleAtAGlanceCard } from "@/features/workload/components/people-glance-card";
import { PersonFocusList } from "@/features/workload/components/person-focus-list";
import { ProjectBalanceCard } from "@/features/workload/components/project-balance-card";
import { TeamMixCard } from "@/features/workload/components/team-mix-card";
import {
  EstimateCoverageBanner,
  WorkloadSummary,
} from "@/features/workload/components/workload-summary";
import type { WorkloadDto } from "@/features/workload/types/workload.types";

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

  const teamQuery = data.selectedTeamId ? `?teamId=${data.selectedTeamId}` : "";
  const peopleHref = `/workload/people${teamQuery}`;
  const personHref = (userId: string) =>
    `/workload/people${teamQuery}${teamQuery ? "&" : "?"}person=${userId}`;

  const heroHeader = (
    <section className="relative overflow-hidden rounded-3xl border border-border/60 hero-mesh p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-glow">
            <BarChart3 className="h-6 w-6" />
          </span>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/12 px-2.5 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
              <Sparkles className="h-3 w-3" />
              Resource Planning
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
              Capacity & Workload
            </h1>
            <p className="text-[13px] text-muted-foreground">
              Unfinished work queued against each person, across every project.
            </p>
          </div>
        </div>

        {data.teams.length > 0 && (
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="w-full sm:w-64">
              <Select value={data.selectedTeamId ?? undefined} onValueChange={selectTeam}>
                <SelectTrigger className="bg-surface/90">
                  <SelectValue placeholder="Choose a team" />
                </SelectTrigger>
                <SelectContent>
                  {data.teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name} · {team.memberCount}{" "}
                      {team.memberCount === 1 ? "person" : "people"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div
              className="inline-flex rounded-2xl border border-border/60 bg-surface-sunken/80 p-1 shadow-2xs"
              role="group"
              aria-label="View"
            >
              <ModeButton current={mode} value="list" onSelect={setMode}>
                By person
              </ModeButton>
              <ModeButton current={mode} value="grid" onSelect={setMode}>
                By week
              </ModeButton>
            </div>
            {loading && <span className="text-xs font-medium text-muted-foreground">Loading…</span>}
          </div>
        )}
      </div>
    </section>
  );

  if (data.teams.length === 0) {
    return (
      <AppFrame className="space-y-6">
        {heroHeader}
        <Card>
          <EmptyState
            icon={<Users />}
            title="You don't manage a team yet"
            description="An admin can assign you as a team manager, and this page will show that team's load."
          />
        </Card>
      </AppFrame>
    );
  }

  const { rows, totals } = data;
  const overloaded = rows.filter((r) => r.status === "OVERLOADED");
  const hasRoom = rows.filter((r) => r.status === "LIGHT");

  return (
    <AppFrame className="space-y-6">
      {heroHeader}

      <div className="space-y-5">
        <WorkloadSummary totals={totals} />
        <EstimateCoverageBanner totals={totals} />

        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Users />}
              title="This team has no members yet"
              description="Add people to the team in Admin → Teams and their load will appear here."
            />
          </Card>
        ) : mode === "grid" ? (
          <WorkloadGrid grid={data.grid} workingWeek={data.workingWeek} />
        ) : (
          <>
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
              <div className="space-y-5">
                <TeamMixCard rows={rows} />
                <PeopleAtAGlanceCard rows={rows} viewAllHref={peopleHref} />
                <PersonFocusList
                  status="OVERLOADED"
                  rows={overloaded}
                  icon={<Activity />}
                  emptyText="Nobody is over two weeks queued."
                  personHref={personHref}
                  viewAllHref={peopleHref}
                />
                <PersonFocusList
                  status="LIGHT"
                  rows={hasRoom}
                  icon={<Smile />}
                  emptyText="Nobody has spare capacity right now."
                  personHref={personHref}
                  viewAllHref={peopleHref}
                />
              </div>

              <div className="space-y-5 lg:col-span-2">
                <CapacityCard rows={rows} />
                <ProjectBalanceCard
                  projects={data.projects}
                  viewAllHref={`/workload/projects${teamQuery}`}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Based on a {data.workingWeek.label}. Two of those weeks queued counts as
              overloaded. An admin can change it in Admin → Organization.
            </p>
          </>
        )}
      </div>
    </AppFrame>
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
        "rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20",
        active
          ? "bg-surface text-foreground shadow-xs ring-1 ring-border/50"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
