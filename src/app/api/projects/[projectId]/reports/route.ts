import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { ReportService } from "@/features/reports/services/report.service";

type Params = { params: { projectId: string } };

// GET /api/projects/{projectId}/reports — the available reports' metadata
// (11_reports.md, ADR-0020).
export async function GET(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await ReportService.listReports(actor, params.projectId));
  });
}
