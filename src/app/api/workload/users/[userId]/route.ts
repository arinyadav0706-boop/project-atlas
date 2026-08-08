import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { WorkloadService } from "@/features/workload/services/workload.service";
import { workloadUserParamsSchema } from "@/features/workload/validation/workload.schemas";

type Params = { params: Promise<{ userId: string }> };

// GET /api/workload/users/{userId} — that person's open issues (drill-in).
// Scope-checked in the service: seeing a number never implies seeing the work.
export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const { userId } = workloadUserParamsSchema.parse(params);
    return NextResponse.json(await WorkloadService.getUserIssues(actor, userId));
  });
}
