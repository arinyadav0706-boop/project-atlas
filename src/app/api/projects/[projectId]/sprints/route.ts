import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { SprintService } from "@/features/sprints/services/sprint.service";
import { createSprintSchema } from "@/features/sprints/validation/sprint.schemas";

type Params = { params: { projectId: string } };

// GET /api/projects/{projectId}/sprints — sprints with derived progress (07_sprint.md).
export async function GET(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    return NextResponse.json(await SprintService.list(actor, params.projectId));
  });
}

// POST /api/projects/{projectId}/sprints — create a PLANNED sprint (LEAD, BR-4).
export async function POST(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const input = createSprintSchema.parse(await request.json());
    const sprint = await SprintService.create(actor, params.projectId, input);
    return NextResponse.json(sprint, { status: 201 });
  });
}
