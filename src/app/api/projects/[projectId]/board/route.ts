import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { BoardService } from "@/features/board/services/board.service";
import { boardFilterSchema } from "@/features/board/validation/board.schemas";

type Params = { params: { projectId: string } };

// GET /api/projects/{projectId}/board?<BoardFilter> — the project-level board,
// grouped into the four status columns and ordered by rank (05_board.md).
export async function GET(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const q = request.nextUrl.searchParams;
    const labelIds = q.getAll("labelIds");
    const filter = boardFilterSchema.parse({
      sprintId: q.get("sprintId") ?? undefined,
      epicId: q.get("epicId") ?? undefined,
      assigneeId: q.get("assigneeId") ?? undefined,
      type: q.get("type") ?? undefined,
      priority: q.get("priority") ?? undefined,
      labelIds: labelIds.length ? labelIds : undefined,
      search: q.get("search") ?? undefined,
    });
    return NextResponse.json(
      await BoardService.getBoard(actor, params.projectId, filter),
    );
  });
}
