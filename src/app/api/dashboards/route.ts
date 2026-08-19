import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor, requireMutationActor } from "@/features/authentication/services/actor.service";
import { DashboardService } from "@/features/dashboards/services/dashboard.service";
import { createDashboardSchema } from "@/features/dashboards/validation/dashboard.schemas";

// Dashboards are everyone's (ADR-0044 §1) — no capability check anywhere here.
export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await DashboardService.list(actor));
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = createDashboardSchema.parse(await request.json());
    return NextResponse.json(await DashboardService.create(actor, input), { status: 201 });
  });
}
