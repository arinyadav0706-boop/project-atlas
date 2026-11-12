import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { activityPickerQuerySchema } from "@/features/timesheets/validation/timesheet.schemas";

// GET /api/timesheets/pickers/activities?q=&categoryId= (BR-22).
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const url = request.nextUrl.searchParams;
    const { q, categoryId } = activityPickerQuerySchema.parse({
      q: url.get("q") ?? undefined,
      categoryId: url.get("categoryId") ?? undefined,
    });
    return NextResponse.json(await TimesheetService.activityOptions(actor, q || undefined, categoryId));
  });
}
