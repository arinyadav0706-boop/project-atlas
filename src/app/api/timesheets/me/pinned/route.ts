import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor, requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { rowInputSchema } from "@/features/timesheets/validation/timesheet.schemas";

// GET /api/timesheets/me/pinned — "Manage recurring".
export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await TimesheetService.listPinned(actor));
  });
}

// POST /api/timesheets/me/pinned — add a recurring row.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = rowInputSchema.parse(await request.json());
    return NextResponse.json(await TimesheetService.addPinned(actor, input), { status: 201 });
  });
}
