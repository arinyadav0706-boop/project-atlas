import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { updateProjectSchema } from "@/features/projects/validation/project.schemas";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await ProjectService.get(actor, params.projectId));
  });
}

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateProjectSchema.parse(await request.json());
    return NextResponse.json(await ProjectService.update(actor, params.projectId, input));
  });
}

export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await ProjectService.delete(actor, params.projectId);
    return new NextResponse(null, { status: 204 });
  });
}
