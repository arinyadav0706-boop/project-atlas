"use client";

import Link from "next/link";
import { ArrowRight, Scale, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { Input } from "@/shared/components/ui/input";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import { cn } from "@/shared/lib/utils";
import { hours, STATUS_META } from "@/features/workload/components/status-meta";
import type { WorkloadProjectDto } from "@/features/workload/types/workload.types";

const MAX_ROWS = 5;
const MIN_SEGMENT_PERCENT = 2;

export function ProjectBalanceCard({
  projects,
  viewAllHref,
}: {
  projects: WorkloadProjectDto[];
  viewAllHref?: string;
}) {
  const [query, setQuery] = useState("");

  const filteredProjects = useMemo(() => {
    if (!query.trim()) return projects;
    const q = query.toLowerCase().trim();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)
    );
  }, [projects, query]);

  // If viewAllHref is present, show top MAX_ROWS for the dashboard glance.
  // Otherwise, use pagination for the dedicated /workload/projects page.
  const {
    paginatedItems,
    paginationProps,
  } = usePagination({
    items: filteredProjects,
    initialPageSize: 10,
    itemLabel: "projects",
    resetDeps: [query],
  });

  const displayList = viewAllHref ? projects.slice(0, MAX_ROWS) : paginatedItems;
  const hidden = projects.length - displayList.length;
  const heaviest = displayList.reduce((max, p) => Math.max(max, p.remainingMinutes), 0);

  return (
    <Card>
      <CardHeader
        icon={<Scale />}
        title="Project balance"
        action={
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
            {projects.length}
          </span>
        }
      />

      {/* Search Bar on Full Page */}
      {!viewAllHref && projects.length > 5 && (
        <div className="border-b border-border/60 p-4">
          <div className="relative max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects by name or key…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      )}

      <CardContent className="p-4">
        {projects.length === 0 ? (
          <EmptyState
            compact
            title="No open work"
            description="Nobody on this team has an open issue in any project."
          />
        ) : displayList.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No projects match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <>
            <ul className="space-y-3.5">
              {displayList.map((project) => (
                <ProjectRow
                  key={project.projectId}
                  project={project}
                  heaviest={heaviest}
                />
              ))}
            </ul>

            {viewAllHref && (
              <Link
                href={viewAllHref}
                className="mt-3.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {hidden > 0
                  ? `View all ${projects.length} projects`
                  : "View project detail"}
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </>
        )}
      </CardContent>

      {!viewAllHref && projects.length > 0 && (
        <DataPagination {...paginationProps} pageSizeOptions={[5, 10, 20]} />
      )}
    </Card>
  );
}

function ProjectRow({
  project,
  heaviest,
}: {
  project: WorkloadProjectDto;
  heaviest: number;
}) {
  const percentOfHeaviest = heaviest === 0 ? 0 : Math.round((project.remainingMinutes / heaviest) * 100);

  return (
    <li className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <Link
          href={`/projects/${project.projectId}/issues`}
          className="font-medium text-foreground hover:text-primary hover:underline"
        >
          {project.name}
          <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
            ({project.key})
          </span>
        </Link>
        <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
          {hours(project.remainingMinutes)}
        </span>
      </div>

      {/* Distribution Track */}
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className="flex h-full rounded-full transition-all duration-300 overflow-hidden"
          style={{ width: `${percentOfHeaviest}%` }}
        >
          {project.segments.map((segment) => {
            const segPct =
              project.remainingMinutes === 0
                ? 0
                : (segment.minutes / project.remainingMinutes) * 100;
            if (segPct < MIN_SEGMENT_PERCENT) return null;
            return (
              <div
                key={segment.userId}
                className={cn("h-full transition-all", STATUS_META[segment.status].dot)}
                style={{ width: `${segPct}%` }}
                title={`${segment.name}: ${hours(segment.minutes)}`}
              />
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {project.people} {project.people === 1 ? "person" : "people"} · {project.openIssues} {project.openIssues === 1 ? "issue" : "issues"}
        </span>
        <span>
          ~{project.weeksPerPerson} wk / person
        </span>
      </div>
    </li>
  );
}
