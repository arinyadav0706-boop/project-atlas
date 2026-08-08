import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { updateIssueSchema } from "@/features/issues/validation/issue.schemas";

type Params = { params: Promise<{ issueId: string }> };

export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await IssueService.get(actor, params.issueId));
  });
}

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateIssueSchema.parse(await request.json());
    return NextResponse.json(await IssueService.update(actor, params.issueId, input));
  });
}

export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await IssueService.delete(actor, params.issueId);
    return new NextResponse(null, { status: 204 });
  });
}
