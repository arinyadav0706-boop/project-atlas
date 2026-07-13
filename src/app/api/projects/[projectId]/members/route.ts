import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { addProjectMemberSchema } from "@/features/projects/validation/project.schemas";

type Params = { params: { projectId: string } };

export async function GET(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    return NextResponse.json(
      await ProjectService.listMembers(actor, params.projectId),
    );
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const input = addProjectMemberSchema.parse(await request.json());
    const member = await ProjectService.addMember(actor, params.projectId, input);
    return NextResponse.json(member, { status: 201 });
  });
}
