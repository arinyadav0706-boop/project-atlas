import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { SprintService } from "@/features/sprints/services/sprint.service";

type Params = { params: { sprintId: string } };

// POST /api/sprints/{sprintId}/start — PLANNED → ACTIVE (BR-1 one-active, BR-2
// dates required; LEAD). 409 if another sprint is already active.
export async function POST(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    return NextResponse.json(await SprintService.start(actor, params.sprintId));
  });
}
