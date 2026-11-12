import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";

type Params = { params: Promise<{ activityId: string }> };

// POST /api/activities/{id}/favorite — idempotent.
export async function POST(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await TimesheetService.setActivityFavourite(actor, params.activityId, true);
    return new NextResponse(null, { status: 204 });
  });
}

// DELETE /api/activities/{id}/favorite — idempotent.
export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await TimesheetService.setActivityFavourite(actor, params.activityId, false);
    return new NextResponse(null, { status: 204 });
  });
}
