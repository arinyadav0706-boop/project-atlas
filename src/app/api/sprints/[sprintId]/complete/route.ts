import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { SprintService } from "@/features/sprints/services/sprint.service";
import { completeSprintSchema } from "@/features/sprints/validation/sprint.schemas";

type Params = { params: Promise<{ sprintId: string }> };

// POST /api/sprints/{sprintId}/complete — ACTIVE → COMPLETED; incomplete issues
// return to the backlog, or to a chosen follow-up PLANNED sprint (BR-3; LEAD).
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    // Body is optional (default: return to backlog).
    const raw = await request.json().catch(() => ({}));
    const { moveIncompleteToSprintId } = completeSprintSchema.parse(raw ?? {});
    return NextResponse.json(
      await SprintService.complete(actor, params.sprintId, moveIncompleteToSprintId),
    );
  });
}
