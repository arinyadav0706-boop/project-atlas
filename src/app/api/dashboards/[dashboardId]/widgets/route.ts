import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { DashboardService } from "@/features/dashboards/services/dashboard.service";
import { setWidgetsSchema } from "@/features/dashboards/validation/dashboard.schemas";

type Params = { params: Promise<{ dashboardId: string }> };

// PUT replaces the whole widget set. The array's order IS the display order,
// so reordering and editing are the same call and cannot disagree.
export async function PUT(request: NextRequest, props: Params) {
  const { dashboardId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = setWidgetsSchema.parse(await request.json());
    return NextResponse.json(await DashboardService.setWidgets(actor, dashboardId, input));
  });
}
