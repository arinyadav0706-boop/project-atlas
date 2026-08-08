import { NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";

type Params = { params: Promise<{ projectId: string }> };

// GET /api/projects/{projectId}/epics — the project's epics for the create/edit
// epic selector and the board Epic filter (ADR-0026). Any org member who can see
// the project can read it.
export async function GET(_request: Request, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json({
      epics: await IssueService.listEpics(actor, params.projectId),
    });
  });
}
