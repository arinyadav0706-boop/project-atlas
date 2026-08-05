import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { WorkloadService } from "@/features/workload/services/workload.service";
import { workloadQuerySchema } from "@/features/workload/validation/workload.schemas";

// GET /api/workload?teamId=… — team scope + the selected team's rows/totals.
// Scope is resolved server-side (21_workload.md BR-8); the query only selects
// among teams the caller already has.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const { teamId } = workloadQuerySchema.parse({
      teamId: request.nextUrl.searchParams.get("teamId") ?? undefined,
    });
    return NextResponse.json(await WorkloadService.getWorkload(actor, teamId));
  });
}
