"use client";

import { Scale } from "lucide-react";
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

// Six is where a card stops being a summary. A team spanning the org would
// otherwise turn one panel into the whole page.
const MAX_ROWS = 6;
// Below this a segment is a hairline that reads as a rendering artefact; it
// still counts in the totals and the tooltip, it just stops being drawn as its
// own stripe.
const MIN_SEGMENT_PERCENT = 2;

export function ProjectBalanceCard({ projects }: { projects: WorkloadProjectDto[] }) {
  const shown = projects.slice(0, MAX_ROWS);
  const hidden = projects.length - shown.length;
  const heaviest = projects.reduce((max, p) => Math.max(max, p.remainingMinutes), 0);

  return (
    <Card>
      <CardHeader icon={<Scale />} title="Project balance" />
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
                <ProjectRow key={project.projectId} project={project} heaviest={heaviest} />
              ))}
            </ul>
            {hidden > 0 && (
              <p className="mt-3.5 text-[12px] text-muted-foreground">
                +{hidden} more {hidden === 1 ? "project" : "projects"} with open work
              </p>
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
        <p className="truncate text-[13px] font-medium text-foreground" title={project.name}>
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
