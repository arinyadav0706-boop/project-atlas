import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetApprovalService } from "@/features/timesheets/services/timesheet-approval.service";
import { returnSchema } from "@/features/timesheets/validation/timesheet.schemas";

type Params = { params: Promise<{ timesheetId: string }> };

// POST /api/timesheets/{id}/return — return specific lines with a reason (BR-26).
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = returnSchema.parse(await request.json());
    return NextResponse.json(await TimesheetApprovalService.returnLines(actor, params.timesheetId, input));
  });
}
