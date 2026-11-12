import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { isoDateSchema, submitSchema } from "@/features/timesheets/validation/timesheet.schemas";

type Params = { params: Promise<{ periodStart: string }> };

// POST …/submit — 422 with `problems` when blocked (BR-24).
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const periodStart = isoDateSchema.parse(params.periodStart);
    const { expectedVersion } = submitSchema.parse(await request.json());
    return NextResponse.json(await TimesheetService.submit(actor, periodStart, expectedVersion));
  });
}
