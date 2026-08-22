import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { WorkflowService } from "@/features/workflow/services/workflow.service";
import { transitionsSchema } from "@/features/workflow/validation/workflow.schemas";

// The allowed set and the enforcement flag, replaced together (BR-10). Setting
// them separately would leave a moment where enforcement is on with no rules,
// which freezes every issue in the project where it stands.

type Params = { params: Promise<{ projectId: string }> };

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = transitionsSchema.parse(await request.json());
    return NextResponse.json(
      await WorkflowService.setTransitions(actor, params.projectId, input),
    );
  });
}
