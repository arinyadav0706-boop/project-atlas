import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { WorkLogService } from "@/features/time-tracking/services/work-log.service";
import { updateWorkLogSchema } from "@/features/time-tracking/validation/work-log.schemas";

type Params = { params: { workLogId: string } };

// PATCH /api/worklogs/{id} — edit your own log (BR-3, OCC).
export async function PATCH(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateWorkLogSchema.parse(await request.json());
    return NextResponse.json(
      await WorkLogService.update(actor, params.workLogId, input),
    );
  });
}

// DELETE /api/worklogs/{id} — author or LEAD (BR-4, soft delete).
export async function DELETE(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await WorkLogService.delete(actor, params.workLogId);
    return NextResponse.json({ ok: true });
  });
}
