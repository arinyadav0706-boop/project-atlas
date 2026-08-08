import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { WorkLogService } from "@/features/time-tracking/services/work-log.service";
import { setEstimateSchema } from "@/features/time-tracking/validation/work-log.schemas";

type Params = { params: Promise<{ issueId: string }> };

// PUT /api/issues/{issueId}/estimate — set/clear the estimate (MEMBER/LEAD,
// BR-5) → refreshed time summary.
export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = setEstimateSchema.parse(await request.json());
    return NextResponse.json(
      await WorkLogService.setEstimate(actor, params.issueId, input),
    );
  });
}
