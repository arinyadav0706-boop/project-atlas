import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { CommentService } from "@/features/comments/services/comment.service";

type Params = { params: { commentId: string } };

// GET /api/comments/{commentId}/thread?cursor=&take= — one thread's own page
// (ADR-0038 §4): the root plus a keyset page of every reply. A long discussion
// gets a URL instead of an ever-growing issue view.
export async function GET(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const url = request.nextUrl.searchParams;
    const takeParam = url.get("take");
    return NextResponse.json(
      await CommentService.thread(actor, params.commentId, {
        cursor: url.get("cursor") ?? undefined,
        take: takeParam ? Number(takeParam) : undefined,
      }),
    );
  });
}
