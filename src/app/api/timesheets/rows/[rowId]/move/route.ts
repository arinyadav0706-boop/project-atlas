import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { moveRowSchema } from "@/features/timesheets/validation/timesheet.schemas";

type Params = { params: Promise<{ rowId: string }> };

// POST …/move — { direction: "up" | "down" }; order persists.
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const { direction } = moveRowSchema.parse(await request.json());
    await TimesheetService.moveRow(actor, params.rowId, direction);
    return new NextResponse(null, { status: 204 });
  });
}
