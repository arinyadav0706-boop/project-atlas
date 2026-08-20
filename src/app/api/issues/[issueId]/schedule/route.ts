import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TimelineService } from "@/features/timeline/services/timeline.service";
import { scheduleIssueSchema } from "@/features/timeline/validation/timeline.schemas";

// Reschedule one issue (28_timeline.md BR-11).
//
// Its own endpoint rather than a corner of the issue PATCH: a drag sends two
// dates and a version and nothing else, so a dragged bar can never carry a
// stale title or assignee from a form somebody left open.

type Params = { params: Promise<{ issueId: string }> };

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = scheduleIssueSchema.parse(await request.json());
    return NextResponse.json(
      await TimelineService.schedule(actor, params.issueId, input),
    );
  });
}
