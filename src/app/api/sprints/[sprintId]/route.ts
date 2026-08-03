import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { SprintService } from "@/features/sprints/services/sprint.service";
import { updateSprintSchema } from "@/features/sprints/validation/sprint.schemas";

type Params = { params: { sprintId: string } };

// PATCH /api/sprints/{sprintId} — edit name/goal/dates (LEAD, BR-4).
export async function PATCH(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateSprintSchema.parse(await request.json());
    return NextResponse.json(
      await SprintService.update(actor, params.sprintId, input),
    );
  });
}

// DELETE /api/sprints/{sprintId} — soft-delete a PLANNED/COMPLETED sprint
// (LEAD; an ACTIVE sprint must be completed first). Issues return to the backlog.
export async function DELETE(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await SprintService.delete(actor, params.sprintId);
    return NextResponse.json({ ok: true });
  });
}
