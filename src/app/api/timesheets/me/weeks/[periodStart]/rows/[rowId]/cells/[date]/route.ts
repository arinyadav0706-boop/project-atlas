import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";
import { isoDateSchema, saveCellSchema } from "@/features/timesheets/validation/timesheet.schemas";

type Params = { params: Promise<{ periodStart: string; rowId: string; date: string }> };

// PUT /api/timesheets/me/weeks/{periodStart}/rows/{rowId}/cells/{date} —
// autosave one cell (BR-5–BR-8). rowId may be `pinned:<id>`.
export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const periodStart = isoDateSchema.parse(params.periodStart);
    const date = isoDateSchema.parse(params.date);
    const input = saveCellSchema.parse(await request.json());
    return NextResponse.json(
      await TimesheetService.saveCell(actor, periodStart, decodeURIComponent(params.rowId), date, input),
    );
  });
}
