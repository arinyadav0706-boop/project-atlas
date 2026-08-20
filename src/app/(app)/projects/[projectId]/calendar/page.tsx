// The grid reflects live dates — never serve it stale.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { PageHeader } from "@/shared/components/ui/page-header";
import { parseIssueFilter } from "@/features/issues/validation/issue-filter.schemas";
import { CalendarView } from "@/features/calendar/components/calendar-view";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";

// Calendar (29_calendar.md §5, ADR-0048).
//
// The grid loads client-side: it depends on the visible window, which changes
// with a button press, and round-tripping the server for arithmetic that is
// pure would make paging months feel like navigation.
export default async function ProjectCalendarPage(props: {
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
        icon={<CalendarDays />}
        title="Calendar"
        subtitle="What lands on which day, and what still has no date at all."
        className="mb-5"
      />
      <CalendarView
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
 * With no params the calendar opens on **open work**, for the same reason the
 * Timeline does: a month whose cells are full of finished issues is a picture
 * of the archive, and on a real project the done ones outnumber the live ones
 * enough to push them out of the three-bar cap. Set as the initial FILTER, not
 * injected in the service, so the bar visibly reads "Open (not done)" and one
 * click clears it — a default you cannot see is one you will misread.
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
