import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetApprovalService } from "@/features/timesheets/services/timesheet-approval.service";
import { approveSchema } from "@/features/timesheets/validation/timesheet.schemas";

type Params = { params: Promise<{ timesheetId: string }> };

// POST /api/timesheets/{id}/approve — as one of the current round's approvers.
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const body = await request.text();
    const { comment } = approveSchema.parse(body ? JSON.parse(body) : {});
    return NextResponse.json(await TimesheetApprovalService.approve(actor, params.timesheetId, comment));
  });
}
