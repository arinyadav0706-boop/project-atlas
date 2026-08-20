import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { TimelineService } from "@/features/timeline/services/timeline.service";
import { parseIssueFilter } from "@/features/issues/validation/issue-filter.schemas";

// The whole chart in one response (28_timeline.md §4, ADR-0047): bars, tray,
// sprint bands, arrows and conflicts. Split into pieces, the arrows could
// arrive before the bars they point at.

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    // The SAME parser every other list route uses, so the timeline narrows
    // with the controls people already know.
    const filter = parseIssueFilter(request.nextUrl.searchParams);
    return NextResponse.json(
      await TimelineService.get(actor, params.projectId, filter),
    );
  });
}
