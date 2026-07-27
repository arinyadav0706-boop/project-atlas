import { NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";

type Params = { params: { projectId: string } };

// GET /api/projects/{projectId}/epics — the project's epics for the create/edit
// epic selector and the board Epic filter (ADR-0026). Any org member who can see
// the project can read it.
export async function GET(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    return NextResponse.json({ epics: await IssueService.listEpics(actor, params.projectId) });
  });
}
