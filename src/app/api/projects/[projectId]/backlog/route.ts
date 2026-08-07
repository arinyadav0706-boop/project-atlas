import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { BacklogService } from "@/features/backlog/services/backlog.service";
import { parseIssueFilter } from "@/features/issues/validation/issue-filter.schemas";

type Params = { params: { projectId: string } };

// GET /api/projects/{projectId}/backlog?<IssueFilter>&cursor=&take= — the
// project's unscheduled issues (sprintId = null), ordered by rank, keyset-
// paginated (06_backlog.md BR-1), narrowed by the same composable filter the
// Board uses (ADR-0008). Reorder is the shared PATCH /issues/{id}/rank with
// scope=backlog (ADR-0013).
export async function GET(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const url = request.nextUrl.searchParams;
    const takeParam = url.get("take");
    // `sprintId` is meaningless here — the backlog IS the unsprinted set — and
    // the repository drops it regardless; parsing it uniformly keeps one parser.
    const filter = parseIssueFilter(url);
    return NextResponse.json(
      await BacklogService.getBacklog(actor, params.projectId, filter, {
        cursor: url.get("cursor") ?? undefined,
        take: takeParam ? Number(takeParam) : undefined,
      }),
    );
  });
}
