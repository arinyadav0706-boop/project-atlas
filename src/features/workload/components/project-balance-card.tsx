"use client";

import Link from "next/link";
import { ArrowRight, Scale } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { cn } from "@/shared/lib/utils";
import { hours, STATUS_META } from "@/features/workload/components/status-meta";
import type { WorkloadProjectDto } from "@/features/workload/types/workload.types";

// Where the team's queue actually sits (BR-16).
//
// Each bar is segmented by person and coloured by that person's status band, so
// a bar that is mostly red says something the totals cannot: this project's work
// is parked on people who are already over. Bar *lengths* are relative to the
// heaviest project, so the column reads as a ranking.

// Five is where a card stops being a summary.
//
// A manager IS entitled to see every project their team touches — that is the
// whole question this card answers — but a team spanning the org would turn one
// panel into the whole page, and the ranking (which project is heaviest) stops
// being readable somewhere around a dozen bars. So the card shows the top five
// by remaining effort and hands the complete, unbounded list to
// /workload/projects. The count in the link is the real total, so it is always
// visible how much is not being shown.
const MAX_ROWS = 5;
// Below this a segment is a hairline that reads as a rendering artefact; it
// still counts in the totals and the tooltip, it just stops being drawn as its
// own stripe.
const MIN_SEGMENT_PERCENT = 2;

export function ProjectBalanceCard({
  projects,
  /** Omit on the full-list route, where there is nowhere further to go. */
  viewAllHref,
}: {
  projects: WorkloadProjectDto[];
  viewAllHref?: string;
}) {
  const shown = viewAllHref ? projects.slice(0, MAX_ROWS) : projects;
  const hidden = projects.length - shown.length;
  // Relative to the heaviest SHOWN project, so the top bar always fills the
  // track and the five rows read as a ranking among themselves.
  const heaviest = shown.reduce((max, p) => Math.max(max, p.remainingMinutes), 0);

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
      <CardContent>
        {projects.length === 0 ? (
          <EmptyState
            compact
            title="No open work"
            description="Nobody on this team has an open issue in any project."
          />
        ) : (
          <>
            <ul className="space-y-3.5">
              {shown.map((project) => (
                <ProjectRow
                  key={project.projectId}
                  project={project}
                  heaviest={heaviest}
                />
              ))}
            </ul>
            {/* Shown whenever there is a route to go to, not only once the list
                overflows. With four seeded projects nothing was hidden, so the
                link never rendered and /workload/projects was unreachable —
                a manager could not get to the full list until their team
                happened to span six projects. The destination is worth having
                at any size: full width, nothing truncated. */}
            {viewAllHref && (
              <Link
                href={viewAllHref}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent transition-colors hover:text-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {hidden > 0
                  ? `View all ${projects.length} projects`
                  : "View project detail"}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </>
        )}
      </CardContent>
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
  // A project with only unestimated work has zero remaining and so no bar. It
  // still gets a row — vanishing because nobody estimated it is exactly the
  // blind spot the coverage banner warns about (BR-4).
  const width = heaviest > 0 ? (project.remainingMinutes / heaviest) * 100 : 0;
  const estimated = project.openIssues - project.unestimated;

  return (
    <li className="flex items-center gap-4">
      <div className="w-52 shrink-0">
        <p
          className="truncate text-[13px] font-medium text-foreground"
          title={project.name}
        >
          {project.name}
        </p>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {hours(project.remainingMinutes)} · {project.people}{" "}
          {project.people === 1 ? "person" : "people"} ·{" "}
          {project.unestimated > 0
            ? `${estimated}/${project.openIssues} estimated`
            : `${project.openIssues} ${project.openIssues === 1 ? "issue" : "issues"}`}
        </p>
      </div>

      <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="flex h-full" style={{ width: `${width}%` }}>
          {project.segments.map((segment) => {
            const share =
              project.remainingMinutes > 0
                ? (segment.minutes / project.remainingMinutes) * 100
                : 0;
            if (share < MIN_SEGMENT_PERCENT) return null;
            return (
              <span
                key={segment.userId}
                className={cn(
                  // A hairline gap between segments, so two adjacent people in
                  // the same band read as two people and not one long bar.
                  "h-full border-r border-background last:border-r-0",
                  STATUS_META[segment.status].dot,
                )}
                style={{ width: `${share}%` }}
                title={`${segment.name} · ${hours(segment.minutes)}`}
              />
            );
          })}
        </div>
      </div>

      <p className="w-28 shrink-0 text-right text-[12px] tabular-nums text-muted-foreground">
        <span className="font-semibold text-foreground">{project.weeksPerPerson} wk</span>
        <span className="block text-[11px] leading-tight">per person</span>
      </p>
    </li>
  );
}
