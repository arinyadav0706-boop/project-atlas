import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { LabelService } from "@/features/labels/services/label.service";
import { setIssueLabelsSchema } from "@/features/labels/validation/label.schemas";

type Params = { params: Promise<{ issueId: string }> };

// GET /api/issues/{issueId}/labels — the issue's labels.
export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await LabelService.listForIssue(actor, params.issueId));
  });
}

// PUT /api/issues/{issueId}/labels — replace the issue's label set (MEMBER/LEAD).
export async function PUT(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const { labelIds } = setIssueLabelsSchema.parse(await request.json());
    return NextResponse.json(
      await LabelService.setForIssue(actor, params.issueId, labelIds),
    );
  });
}
