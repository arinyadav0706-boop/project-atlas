import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { transitionIssueSchema } from "@/features/issues/validation/issue.schemas";

type Params = { params: Promise<{ issueId: string }> };

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const { status, expectedVersion } = transitionIssueSchema.parse(await request.json());
    return NextResponse.json(
      await IssueService.transition(actor, params.issueId, status, expectedVersion),
    );
  });
}
