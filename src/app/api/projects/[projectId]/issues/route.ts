import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { createIssueSchema } from "@/features/issues/validation/issue.schemas";
import type { IssueStatusDto, IssueTypeDto } from "@/features/issues/types/issue.types";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const url = request.nextUrl.searchParams;
    const takeParam = url.get("take");
    return NextResponse.json(
      await IssueService.list(actor, params.projectId, {
        status: (url.get("status") as IssueStatusDto | null) ?? undefined,
        assigneeId: url.get("assigneeId") ?? undefined,
        type: (url.get("type") as IssueTypeDto | null) ?? undefined,
        cursor: url.get("cursor") ?? undefined,
        take: takeParam ? Number(takeParam) : undefined,
      }),
    );
  });
}

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = createIssueSchema.parse(await request.json());
    const issue = await IssueService.create(actor, params.projectId, input);
    return NextResponse.json(issue, { status: 201 });
  });
}
