import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { SprintService } from "@/features/sprints/services/sprint.service";
import { reorderSprintsSchema } from "@/features/sprints/validation/sprint.schemas";

type Params = { params: { projectId: string } };

// PATCH /api/projects/{projectId}/sprints/order — reorder the planned-sprint
// queue (FUT-8; LEAD). Body: { sprintIds: [...] } in the desired order.
export async function PATCH(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const { sprintIds } = reorderSprintsSchema.parse(await request.json());
    await SprintService.reorderQueue(actor, params.projectId, sprintIds);
    return NextResponse.json({ ok: true });
  });
}
