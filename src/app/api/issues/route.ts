import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { parseIssueFilter } from "@/features/issues/validation/issue-filter.schemas";
import { SavedViewService } from "@/features/saved-views/services/saved-view.service";
import { savedViewSort } from "@/features/saved-views/validation/saved-view.schemas";
import { DEFAULT_SORT } from "@/features/saved-views/types/saved-view.types";

// GET /api/issues?<IssueFilter>&sort=&cursor=&take= — the cross-project issue
// list (22_saved_views.md §4, ADR-0040).
//
// The project scope is NOT a parameter. It is resolved from the caller's
// membership in the service; `projectIds` in the filter can only narrow it
// (ADR-0040 §1).
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const url = request.nextUrl.searchParams;
    const filter = parseIssueFilter(url);
    // An unrecognised sort falls back to the default rather than 400ing: a
    // stale bookmark should still open the list.
    const sort = savedViewSort.safeParse(url.get("sort"));
    const takeParam = url.get("take");
    return NextResponse.json(
      await SavedViewService.queryIssues(
        actor,
        filter,
        sort.success ? sort.data : DEFAULT_SORT,
        {
          cursor: url.get("cursor") ?? undefined,
          take: takeParam ? Number(takeParam) : undefined,
        },
      ),
    );
  });
}
