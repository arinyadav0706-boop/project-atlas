import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { CodeIntegrationService } from "@/features/code-integration/services/code-integration.service";

// The Development panel's data. Any member who can see the issue can see it
// (BR-13) — code links are metadata about work, not a second permission system.
//
// The visibility check is `IssueService.get`, which already enforces the tenant
// scope and the project's own rules; doing it a second way here would be a
// second way to get it wrong.

type Params = { params: Promise<{ issueId: string }> };

export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    await IssueService.get(actor, params.issueId);
    return NextResponse.json(await CodeIntegrationService.linksForIssue(params.issueId));
  });
}
