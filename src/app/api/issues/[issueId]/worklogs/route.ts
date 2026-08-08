import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { WorkLogService } from "@/features/time-tracking/services/work-log.service";
import { createWorkLogSchema } from "@/features/time-tracking/validation/work-log.schemas";

type Params = { params: Promise<{ issueId: string }> };

// GET /api/issues/{issueId}/worklogs — logs (newest-first, keyset) + summary
// (19_time_tracking.md). Any org member who can see the issue may read.
export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const url = request.nextUrl.searchParams;
    const takeParam = url.get("take");
    return NextResponse.json(
      await WorkLogService.list(actor, params.issueId, {
        cursor: url.get("cursor") ?? undefined,
        take: takeParam ? Number(takeParam) : undefined,
      }),
    );
  });
}

// POST /api/issues/{issueId}/worklogs — log time (MEMBER/LEAD, BR-1/2).
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = createWorkLogSchema.parse(await request.json());
    const log = await WorkLogService.create(actor, params.issueId, input);
    return NextResponse.json(log, { status: 201 });
  });
}
