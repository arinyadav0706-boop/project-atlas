import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { reorderPinnedSchema } from "@/features/timesheets/validation/timesheet.schemas";

type Params = { params: Promise<{ pinnedRowId: string }> };

// PATCH /api/timesheets/me/pinned/{id} — reorder.
export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const { position } = reorderPinnedSchema.parse(await request.json());
    return NextResponse.json(await TimesheetService.reorderPinned(actor, params.pinnedRowId, position));
  });
}

// DELETE /api/timesheets/me/pinned/{id} — existing weeks keep their rows.
export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await TimesheetService.removePinned(actor, params.pinnedRowId);
    return new NextResponse(null, { status: 204 });
  });
}
