import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { isoDateSchema } from "@/features/timesheets/validation/timesheet.schemas";

type Params = { params: Promise<{ periodStart: string }> };

// POST …/copy-previous — last period's rows, never hours (BR-20).
export async function POST(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const periodStart = isoDateSchema.parse(params.periodStart);
    return NextResponse.json(await TimesheetService.copyPrevious(actor, periodStart));
  });
}
