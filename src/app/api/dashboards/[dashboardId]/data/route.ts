import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { DashboardService } from "@/features/dashboards/services/dashboard.service";

type Params = { params: Promise<{ dashboardId: string }> };

// Every widget's data in ONE response (ADR-0044 §5). The viewer's project scope
// is resolved once here rather than per widget — that membership read is the
// expensive part.
export async function GET(_request: NextRequest, props: Params) {
  const { dashboardId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await DashboardService.data(actor, dashboardId));
  });
}
