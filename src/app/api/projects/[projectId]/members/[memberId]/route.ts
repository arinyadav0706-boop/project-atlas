import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { updateProjectMemberSchema } from "@/features/projects/validation/project.schemas";

type Params = { params: { projectId: string; memberId: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const input = updateProjectMemberSchema.parse(await request.json());
    await ProjectService.changeMemberRole(
      actor,
      params.projectId,
      params.memberId,
      input,
    );
    return new NextResponse(null, { status: 204 });
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    await ProjectService.removeMember(actor, params.projectId, params.memberId);
    return new NextResponse(null, { status: 204 });
  });
}
