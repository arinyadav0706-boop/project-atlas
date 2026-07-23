import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { ReportService } from "@/features/reports/services/report.service";

type Params = { params: { projectId: string; reportId: string } };

// GET /api/projects/{projectId}/reports/{reportId}?<params> — run one report.
// The registry dispatches by id; query params are passed through to compute.
export async function GET(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const query = Object.fromEntries(request.nextUrl.searchParams.entries());
    return NextResponse.json(
      await ReportService.runReport(actor, params.projectId, params.reportId, query),
    );
  });
}
