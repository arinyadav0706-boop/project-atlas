import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor, requireMutationActor } from "@/features/authentication/services/actor.service";
import { CommentService } from "@/features/comments/services/comment.service";
import { createCommentSchema } from "@/features/comments/validation/comment.schemas";

type Params = { params: { issueId: string } };

// GET /api/issues/{issueId}/comments?cursor=&take= — the issue's comments,
// oldest-first, keyset-paginated (08_comments.md BR-2).
export async function GET(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const url = request.nextUrl.searchParams;
    const takeParam = url.get("take");
    return NextResponse.json(
      await CommentService.list(actor, params.issueId, {
        cursor: url.get("cursor") ?? undefined,
        take: takeParam ? Number(takeParam) : undefined,
      }),
    );
  });
}

// POST /api/issues/{issueId}/comments — post a comment (MEMBER/LEAD, BR-1).
export async function POST(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = createCommentSchema.parse(await request.json());
    const comment = await CommentService.create(actor, params.issueId, input);
    return NextResponse.json(comment, { status: 201 });
  });
}
