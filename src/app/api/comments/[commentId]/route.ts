import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { CommentService } from "@/features/comments/services/comment.service";
import { updateCommentSchema } from "@/features/comments/validation/comment.schemas";

type Params = { params: { commentId: string } };

// PATCH /api/comments/{commentId} — edit your own comment; OCC (BR-3).
export async function PATCH(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateCommentSchema.parse(await request.json());
    return NextResponse.json(
      await CommentService.update(actor, params.commentId, input),
    );
  });
}

// DELETE /api/comments/{commentId} — delete your own (or any, as LEAD) (BR-4).
export async function DELETE(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await CommentService.delete(actor, params.commentId);
    return NextResponse.json({ ok: true });
  });
}
