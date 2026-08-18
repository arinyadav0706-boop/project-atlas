// The list reflects live issue state — never serve it stale.
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { SavedViewService } from "@/features/saved-views/services/saved-view.service";
import { parseIssueFilter } from "@/features/issues/validation/issue-filter.schemas";
import { IssueWorkspace } from "@/features/saved-views/components/issue-workspace";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";

// Cross-project issues + saved views (22_saved_views.md §5, ADR-0040).
//
// The filter is read from the URL here so a shared link opens already filtered
// rather than flashing the unfiltered list and then narrowing.
export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const params = await searchParams;
  const [views, projects] = await Promise.all([
    SavedViewService.list(actor),
    ProjectService.list(actor),
  ]);

  return (
    <IssueWorkspace
      projects={projects.map((p) => ({ id: p.id, key: p.key, name: p.name }))}
      currentUserId={actor.userId}
      initialViews={views}
      initialFilter={parseFilterFromParams(params)}
    />
  );
}

/**
 * `searchParams` gives `string | string[]`; the shared parser reads a
 * `URLSearchParams`. Rebuild one and hand it to `parseIssueFilter` — the SAME
 * function the API route uses.
 *
 * This started life as a second, hand-written reader and immediately proved why
 * that is a bad idea: it did not know about `openOnly`, so the Workload banner's
 * link arrived, lost the field on the server, and the client then rewrote the
 * URL without it. One wire format, one parser.
 *
 * A malformed link yields the empty filter rather than a crash — the same
 * posture as a corrupt stored filter (BR-8).
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
    return parseIssueFilter(query);
  } catch {
    return {};
  }
}
