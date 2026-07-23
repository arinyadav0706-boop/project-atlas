import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { ComponentService } from "@/features/components/services/component.service";
import { setIssueComponentsSchema } from "@/features/components/validation/component.schemas";

type Params = { params: { issueId: string } };

// GET /api/issues/{issueId}/components — the issue's components.
export async function GET(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    return NextResponse.json(await ComponentService.listForIssue(actor, params.issueId));
  });
}

// PUT /api/issues/{issueId}/components — replace the issue's component set
// (MEMBER/LEAD); applies default-assignee routing for newly added ones (BR-3).
export async function PUT(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const { componentIds } = setIssueComponentsSchema.parse(await request.json());
    return NextResponse.json(
      await ComponentService.setForIssue(actor, params.issueId, componentIds),
    );
  });
}
