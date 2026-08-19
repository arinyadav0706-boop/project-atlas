import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor, requireMutationActor } from "@/features/authentication/services/actor.service";
import { DashboardService } from "@/features/dashboards/services/dashboard.service";
import { updateDashboardSchema } from "@/features/dashboards/validation/dashboard.schemas";

type Params = { params: Promise<{ dashboardId: string }> };

export async function GET(_request: NextRequest, props: Params) {
  const { dashboardId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await DashboardService.get(actor, dashboardId));
  });
}

export async function PATCH(request: NextRequest, props: Params) {
  const { dashboardId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateDashboardSchema.parse(await request.json());
    return NextResponse.json(await DashboardService.update(actor, dashboardId, input));
  });
}

export async function DELETE(_request: NextRequest, props: Params) {
  const { dashboardId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await DashboardService.remove(actor, dashboardId);
    return new NextResponse(null, { status: 204 });
  });
}
