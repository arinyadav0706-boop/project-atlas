import { NextRequest } from "next/server";
import { v1Route, noContent } from "@/features/public-api/lib/v1";
import { IssueService } from "@/features/issues/services/issue.service";
import { updateIssueSchema } from "@/features/issues/validation/issue.schemas";
import { toPublicIssue } from "@/features/public-api/services/public-mapper";
import { resolveIssueId } from "@/app/api/v1/_resolve";

// One issue, addressable by id or key (`VWP-1301`).

type Params = { params: Promise<{ issueRef: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "issues:read", async ({ actor }) => {
    const id = await resolveIssueId(actor, params.issueRef);
    return toPublicIssue(await IssueService.get(actor, id));
  });
}

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "issues:write", async ({ actor }) => {
    const id = await resolveIssueId(actor, params.issueRef);
    // `expectedVersion` is required by the schema, deliberately: the API
    // exposes `version` on every read (ADR-0011) precisely so a client can
    // detect that the issue moved under it. Letting a write omit it would make
    // the public surface last-write-wins while the UI is not.
    const input = updateIssueSchema.parse(await request.json());
    return toPublicIssue(await IssueService.update(actor, id, input));
  });
}

export async function DELETE(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "issues:write", async ({ actor }) => {
    const id = await resolveIssueId(actor, params.issueRef);
    await IssueService.delete(actor, id);
    return noContent();
  });
}
