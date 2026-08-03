import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor, requireMutationActor } from "@/features/authentication/services/actor.service";
import { ComponentService } from "@/features/components/services/component.service";
import { createComponentSchema } from "@/features/components/validation/component.schemas";

type Params = { params: { projectId: string } };

// GET /api/projects/{projectId}/components — the project's components + the
// viewer's manage right (18_components.md). POST — create (LEAD, BR-1).
export async function GET(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await ComponentService.list(actor, params.projectId));
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = createComponentSchema.parse(await request.json());
    return NextResponse.json(await ComponentService.create(actor, params.projectId, input), {
      status: 201,
    });
  });
}
