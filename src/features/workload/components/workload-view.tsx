"use client";

import { useCallback, useState } from "react";
import { Activity, BarChart3, Smile, Users } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
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

  // The team is client state on this page but a route parameter on the detail
  // routes, so every link out carries it. Without that, "View all people" on
  // Mobile Squad would land on whichever team the server picks by default.
  const teamQuery = data.selectedTeamId ? `?teamId=${data.selectedTeamId}` : "";
  const peopleHref = `/workload/people${teamQuery}`;
  const personHref = (userId: string) =>
    `/workload/people${teamQuery}${teamQuery ? "&" : "?"}person=${userId}`;

  const header = (
    <PageHeader
      icon={<BarChart3 />}
      title="Workload"
      subtitle="Unfinished work queued against each person, across every project."
    />
  );

  if (data.teams.length === 0) {
    return (
      <div className="mx-auto max-w-7xl">
        {header}
        <Card className="mt-6">
          <EmptyState
            icon={<Users />}
            title="You don't manage a team yet"
            description="An admin can assign you as a team manager, and this page will show that team's load."
          />
        </Card>
      </div>
    );
  }

  const { rows, totals } = data;
  const overloaded = rows.filter((r) => r.status === "OVERLOADED");
  const hasRoom = rows.filter((r) => r.status === "LIGHT");

  return (
    <div className="mx-auto max-w-7xl">
      {header}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-72">
          <Select value={data.selectedTeamId ?? undefined} onValueChange={selectTeam}>
            <SelectTrigger>
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
          className="flex rounded-xl border border-border bg-background p-0.5 shadow-card"
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
        {loading && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      <div className="mt-5 space-y-5">
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
            {/* Left column is the shape of the team, right column its people.
                `items-start` keeps every card at its content height instead of
                stretching it to the tallest in the row. */}
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3">
              {/* Narrow column: the four "who" cards, all of them short lists.
                  Wide column: the two visuals that need horizontal room — the
                  per-person axis, and project bars whose per-person segments
                  are unreadable at a third of the width. */}
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

            {/* All people used to sit here — seventeen rows that made this page
                3.1 screens tall and buried the charts. It is /workload/people
                now. A dashboard should fit the question, not the whole answer. */}

            <p className="text-xs text-muted-foreground">
              Based on a {data.workingWeek.label}. Two of those weeks queued counts as
              overloaded. An admin can change it in Admin → Organization.
            </p>
          </>
        )}
      </div>
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
        "rounded-[0.6rem] px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
