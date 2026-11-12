import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { TimesheetApprovalService } from "@/features/timesheets/services/timesheet-approval.service";

type Params = { params: Promise<{ timesheetId: string }> };

// GET /api/timesheets/{id}/history — every approval round (BR-27).
export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await TimesheetApprovalService.history(actor, params.timesheetId));
  });
}
