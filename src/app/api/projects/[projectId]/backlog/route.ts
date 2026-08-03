import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { BacklogService } from "@/features/backlog/services/backlog.service";

type Params = { params: { projectId: string } };

// GET /api/projects/{projectId}/backlog?cursor=&take= — the project's
// unscheduled issues (sprintId = null), ordered by rank, keyset-paginated
// (06_backlog.md BR-1). Reorder is the shared PATCH /issues/{id}/rank with
// scope=backlog (ADR-0013).
export async function GET(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const url = request.nextUrl.searchParams;
    const takeParam = url.get("take");
    return NextResponse.json(
      await BacklogService.getBacklog(actor, params.projectId, {
        cursor: url.get("cursor") ?? undefined,
        take: takeParam ? Number(takeParam) : undefined,
      }),
    );
  });
}
