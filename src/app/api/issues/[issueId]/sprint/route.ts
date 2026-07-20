import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { SprintService } from "@/features/sprints/services/sprint.service";
import { moveIssueToSprintSchema } from "@/features/sprints/validation/sprint.schemas";

type Params = { params: { issueId: string } };

// PATCH /api/issues/{issueId}/sprint — move an issue to a sprint or back to the
// backlog, positioned between neighbours in one atomic write (ADR-0014, BR-6).
// MEMBER/LEAD only (VIEWER → 403).
export async function PATCH(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const input = moveIssueToSprintSchema.parse(await request.json());
    return NextResponse.json(
      await SprintService.moveIssue(actor, params.issueId, input),
    );
  });
}
