import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { BoardService } from "@/features/board/services/board.service";
import { parseIssueFilter } from "@/features/issues/validation/issue-filter.schemas";

type Params = { params: Promise<{ projectId: string; statusId: string }> };

// GET /api/projects/{projectId}/board/columns/{statusId}?cursor=&<BoardFilter>
// — the next page of ONE board column (05_board.md BR-9, UX-5).
//
// A separate route rather than a bigger `take` on the board itself: growing one
// column must not re-read the other eleven, and the other columns' own paging
// must survive it.
//
// The filter is parsed with the SAME parser the board uses, because a page-two
// request under a different filter than page one would silently return cards
// that do not belong in the column being appended to.
export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const filter = parseIssueFilter(request.nextUrl.searchParams);
    const takeParam = request.nextUrl.searchParams.get("take");
    return NextResponse.json(
      await BoardService.getColumnPage(
        actor,
        params.projectId,
        params.statusId,
        filter,
        request.nextUrl.searchParams.get("cursor") ?? undefined,
        takeParam ? Number(takeParam) : undefined,
      ),
    );
  });
}
