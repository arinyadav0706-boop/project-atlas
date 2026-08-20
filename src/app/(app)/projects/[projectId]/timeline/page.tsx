// The chart reflects live dates — never serve it stale.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { PageHeader } from "@/shared/components/ui/page-header";
import { parseIssueFilter } from "@/features/issues/validation/issue-filter.schemas";
import { TimelineView } from "@/features/timeline/components/timeline-view";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";

// Timeline (28_timeline.md §5, ADR-0047).
//
// The chart itself loads client-side: it depends on the zoom, which is a
// client concern, and re-rendering the server component on every zoom change
// would round-trip for something that is pure arithmetic.
export default async function ProjectTimelinePage(props: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, search] = await Promise.all([props.params, props.searchParams]);
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const projects = await ProjectService.list(actor);

  return (
    <>
      <PageHeader
        icon={<CalendarRange />}
        title="Timeline"
        subtitle="When the work is planned, what blocks what, and where that plan breaks."
        className="mb-5"
      />
      <TimelineView
        projectId={params.projectId}
        projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name }))}
        currentUserId={actor.userId}
        initialFilter={parseFilterFromParams(search)}
      />
    </>
  );
}

/**
 * `searchParams` gives `string | string[]`; the shared parser reads a
 * `URLSearchParams`. One wire format, one parser (see /issues).
 *
 * With no params at all the timeline opens on **open work**, not everything. A
 * Gantt is a picture of the plan, and defaulting to include finished issues
 * makes it a picture of the archive — on the seeded project that is 193 closed
 * bars pushing the live ones past the row cap.
 *
 * Set as the initial FILTER rather than injected in the service, so the filter
 * bar visibly reads "Open (not done)" and one click clears it. A default the
 * user cannot see is a default they will misread.
 */
function parseFilterFromParams(
  params: Record<string, string | string[] | undefined>,
): IssueFilter {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const v of value) query.append(key, v);
    else if (value !== undefined) query.set(key, value);
  }
  try {
    const parsed = parseIssueFilter(query);
    return Object.keys(parsed).length === 0 ? { openOnly: true } : parsed;
  } catch {
    return { openOnly: true };
  }
}
