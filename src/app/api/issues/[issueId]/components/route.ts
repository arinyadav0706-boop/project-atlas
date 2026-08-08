import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { ComponentService } from "@/features/components/services/component.service";
import { setIssueComponentsSchema } from "@/features/components/validation/component.schemas";

type Params = { params: Promise<{ issueId: string }> };

// GET /api/issues/{issueId}/components — the issue's components.
export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await ComponentService.listForIssue(actor, params.issueId));
  });
}

// PUT /api/issues/{issueId}/components — replace the issue's component set
// (MEMBER/LEAD); applies default-assignee routing for newly added ones (BR-3).
export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const { componentIds } = setIssueComponentsSchema.parse(await request.json());
    return NextResponse.json(
      await ComponentService.setForIssue(actor, params.issueId, componentIds),
    );
  });
}
