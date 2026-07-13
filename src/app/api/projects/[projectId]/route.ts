import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { updateProjectSchema } from "@/features/projects/validation/project.schemas";

type Params = { params: { projectId: string } };

export async function GET(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    return NextResponse.json(await ProjectService.get(actor, params.projectId));
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const input = updateProjectSchema.parse(await request.json());
    return NextResponse.json(
      await ProjectService.update(actor, params.projectId, input),
    );
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    await ProjectService.delete(actor, params.projectId);
    return new NextResponse(null, { status: 204 });
  });
}
