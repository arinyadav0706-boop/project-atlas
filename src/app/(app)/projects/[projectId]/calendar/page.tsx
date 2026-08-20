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
        initialFilter={parseFilterFromParams(search, actor.userId)}
      />
    </>
  );
}

/**
 * `searchParams` gives `string | string[]`; the shared parser reads a
 * `URLSearchParams`. One wire format, one parser (see /issues).
 *
 * With no params the calendar opens on **my open work**, and both halves of
 * that are deliberate.
 *
 * *Open*, for the same reason the Timeline does: a month full of finished
 * issues is a picture of the archive.
 *
 * *Mine*, because a whole project's month is not a calendar. VERUS Web Platform
 * has ~350 open dated issues in any six-week window — fifty a day, against four
 * that fit in a cell. Every cell reads "+46 more", and a grid that can only ever
 * show eight percent of itself is a worse answer than the issue list. A calendar
 * answers "what do I have on", the way Outlook and Google do and the way Jira's
 * calendar defaults; a project-wide month is the exception you opt into, not the
 * thing to open on.
 *
 * Set as the initial FILTER rather than injected in the service, so the bar
 * visibly reads "Open (not done)" with "Assigned to me" lit, and one click on
 * either widens it. A default you cannot see is one you will misread — and a
 * default you cannot turn off is a bug.
 */
function parseFilterFromParams(
  params: Record<string, string | string[] | undefined>,
  currentUserId: string,
): IssueFilter {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const v of value) query.append(key, v);
    else if (value !== undefined) query.set(key, value);
  }
  const fallback: IssueFilter = { openOnly: true, assigneeId: currentUserId };
  try {
    const parsed = parseIssueFilter(query);
    return Object.keys(parsed).length === 0 ? fallback : parsed;
  } catch {
    return fallback;
  }
}
