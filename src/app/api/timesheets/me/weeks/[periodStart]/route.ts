import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { isoDateSchema } from "@/features/timesheets/validation/timesheet.schemas";

type Params = { params: Promise<{ periodStart: string }> };

// GET /api/timesheets/me/weeks/{periodStart} — my week (37 §4). Read-only.
export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const periodStart = isoDateSchema.parse(params.periodStart);
    return NextResponse.json(await TimesheetService.getWeek(actor, periodStart));
  });
}
