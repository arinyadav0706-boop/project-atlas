import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { reorderIssueSchema } from "@/features/issues/validation/issue.schemas";

type Params = { params: Promise<{ issueId: string }> };

// PATCH /api/issues/{issueId}/rank — reorder a card between two visible
// neighbours, optionally moving it to another column, in one write (ADR-0009).
// Shared by the Board and the Backlog. RBAC: MEMBER/LEAD (VIEWER → 403).
export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = reorderIssueSchema.parse(await request.json());
    return NextResponse.json(await IssueService.reorder(actor, params.issueId, input));
  });
}
