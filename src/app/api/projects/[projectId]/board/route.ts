import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { BoardService } from "@/features/board/services/board.service";
import { parseIssueFilter } from "@/features/issues/validation/issue-filter.schemas";

type Params = { params: Promise<{ projectId: string }> };

// GET /api/projects/{projectId}/board?<BoardFilter> — the project-level board,
// grouped into the four status columns and ordered by rank (05_board.md).
export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const filter = parseIssueFilter(request.nextUrl.searchParams);
    return NextResponse.json(
      await BoardService.getBoard(actor, params.projectId, filter),
    );
  });
}
