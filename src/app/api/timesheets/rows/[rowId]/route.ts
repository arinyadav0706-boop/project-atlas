import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { updateRowSchema } from "@/features/timesheets/validation/timesheet.schemas";

type Params = { params: Promise<{ rowId: string }> };

// PATCH /api/timesheets/rows/{rowId} — work item, tags, billable (OCC).
export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateRowSchema.parse(await request.json());
    return NextResponse.json(await TimesheetService.updateRow(actor, params.rowId, input));
  });
}

// DELETE /api/timesheets/rows/{rowId} — remove the row and its logs (soft).
export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await TimesheetService.removeRow(actor, params.rowId);
    return new NextResponse(null, { status: 204 });
  });
}
