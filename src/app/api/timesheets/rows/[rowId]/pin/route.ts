import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";

type Params = { params: Promise<{ rowId: string }> };

// POST …/pin — make this row recurring (BR-19).
export async function POST(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    return NextResponse.json(await TimesheetService.pinRow(actor, params.rowId), { status: 201 });
  });
}

// DELETE …/pin — stop recurring; this week's row stays.
export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await TimesheetService.unpinRow(actor, params.rowId);
    return new NextResponse(null, { status: 204 });
  });
}
