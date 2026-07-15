import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { updateIssueSchema } from "@/features/issues/validation/issue.schemas";

type Params = { params: { issueId: string } };

export async function GET(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    return NextResponse.json(await IssueService.get(actor, params.issueId));
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const input = updateIssueSchema.parse(await request.json());
    return NextResponse.json(await IssueService.update(actor, params.issueId, input));
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    await IssueService.delete(actor, params.issueId);
    return new NextResponse(null, { status: 204 });
  });
}
