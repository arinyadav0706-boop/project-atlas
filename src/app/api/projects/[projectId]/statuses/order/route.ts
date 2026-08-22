import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { WorkflowService } from "@/features/workflow/services/workflow.service";
import { reorderStatusesSchema } from "@/features/workflow/validation/workflow.schemas";

// PUT, not PATCH: the body is the COMPLETE order (BR-8), so this replaces the
// arrangement rather than amending it.

type Params = { params: Promise<{ projectId: string }> };

export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = reorderStatusesSchema.parse(await request.json());
    return NextResponse.json(await WorkflowService.reorder(actor, params.projectId, input));
  });
}
