import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { issuePickerQuerySchema } from "@/features/timesheets/validation/timesheet.schemas";

// GET /api/timesheets/pickers/issues?q=&periodStart= (BR-21).
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const url = request.nextUrl.searchParams;
    const { q, periodStart } = issuePickerQuerySchema.parse({
      q: url.get("q") ?? undefined,
      periodStart: url.get("periodStart") ?? undefined,
    });
    return NextResponse.json(await TimesheetService.issueOptions(actor, periodStart, q || undefined));
  });
}
