import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { createSubtaskSchema } from "@/features/issues/validation/issue.schemas";

// Subtasks of one parent (26_subtasks.md §4, ADR-0045).
//
// A sub-resource rather than a `parentId` on the plain create: a subtask cannot
// exist without a parent, so the parent belongs in the path where it cannot be
// omitted, and `createIssueSchema` can keep refusing `SUBTASK` outright.

type Params = { params: Promise<{ issueId: string }> };

export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await IssueService.listSubtasks(actor, params.issueId));
  });
}

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = createSubtaskSchema.parse(await request.json());
    return NextResponse.json(
      await IssueService.createSubtask(actor, params.issueId, input),
      { status: 201 },
    );
  });
}
