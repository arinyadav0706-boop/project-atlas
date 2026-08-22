import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { WorkflowService } from "@/features/workflow/services/workflow.service";
import {
  deleteStatusSchema,
  updateStatusSchema,
} from "@/features/workflow/validation/workflow.schemas";

type Params = { params: Promise<{ projectId: string; statusId: string }> };

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = updateStatusSchema.parse(await request.json());
    return NextResponse.json(
      await WorkflowService.update(actor, params.projectId, params.statusId, input),
    );
  });
}

// DELETE carries a body — deliberately. A status with issues on it cannot just
// vanish (BR-6), and where those issues go is a decision only the person
// deleting it can make, so it belongs in the request rather than in a guess.
export async function DELETE(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = deleteStatusSchema.parse(await request.json());
    return NextResponse.json(
      await WorkflowService.remove(actor, params.projectId, params.statusId, input),
    );
  });
}
