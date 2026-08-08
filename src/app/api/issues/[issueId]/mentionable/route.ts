import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { CommentService } from "@/features/comments/services/comment.service";

type Params = { params: Promise<{ issueId: string }> };

// GET /api/issues/{issueId}/mentionable?q= — autocomplete candidates for the
// comment composer (ADR-0038 §1). Scoped to the actor's organization and
// ordered project-members-first; not a user directory.
export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const query = request.nextUrl.searchParams.get("q") ?? "";
    return NextResponse.json({
      items: await CommentService.mentionable(actor, params.issueId, query),
    });
  });
}
