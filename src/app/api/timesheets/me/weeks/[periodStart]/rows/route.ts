import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { isoDateSchema, rowInputSchema } from "@/features/timesheets/validation/timesheet.schemas";

type Params = { params: Promise<{ periodStart: string }> };

// POST /api/timesheets/me/weeks/{periodStart}/rows — add an issue or activity row.
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const periodStart = isoDateSchema.parse(params.periodStart);
    const input = rowInputSchema.parse(await request.json());
    return NextResponse.json(await TimesheetService.addRow(actor, periodStart, input), { status: 201 });
  });
}
