import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { NotFoundError } from "@/shared/lib/errors";
import { IssueRepository } from "@/features/issues/repositories/issue.repository";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { setIssueFieldValuesSchema } from "@/features/custom-fields/validation/custom-field.schemas";

type Params = { params: Promise<{ issueId: string }> };

// PUT /api/issues/{issueId}/custom-fields — set or clear values (BR-8..BR-10).
//
// The whole batch is validated before anything is written: these are fields of
// ONE object, and a half-saved form is worse than a rejected one.
export async function PUT(request: NextRequest, props: Params) {
  const { issueId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const issue = await IssueRepository.findDetail(issueId);
    if (!issue) throw new NotFoundError("Issue not found.");
    const input = setIssueFieldValuesSchema.parse(await request.json());
    return NextResponse.json(
      await CustomFieldService.setForIssue(
        actor,
        { id: issue.id, projectId: issue.projectId },
        input,
      ),
    );
  });
}
