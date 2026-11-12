import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimesheetService } from "@/features/timesheets/services/timesheet.service";

type Params = { params: Promise<{ rowId: string }> };

// POST …/duplicate — work item and tags only, never hours (BR-18).
export async function POST(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    return NextResponse.json(await TimesheetService.duplicateRow(actor, params.rowId), { status: 201 });
  });
}
