import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { WorkflowService } from "@/features/workflow/services/workflow.service";
import { createStatusSchema } from "@/features/workflow/validation/workflow.schemas";

// A project's statuses (30_workflow.md §4, ADR-0049).
//
// GET returns the transitions and the enforcement flag too: the editor needs
// all three to draw one screen, and splitting them would let the matrix render
// against statuses that had already changed.

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await WorkflowService.get(actor, params.projectId));
  });
}

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = createStatusSchema.parse(await request.json());
    return NextResponse.json(
      await WorkflowService.create(actor, params.projectId, input),
      { status: 201 },
    );
  });
}
