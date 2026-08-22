import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { RecurrenceService } from "@/features/recurrence/services/recurrence.service";
import { updateRecurrenceSchema } from "@/features/recurrence/validation/recurrence.schemas";

// One recurrence: edit, pause/resume (`active`), or soft-delete. Any edit to
// the schedule itself re-derives the next firing in the service — a stale
// `nextRunAt` would fire once more on the old day and read as the edit not
// having saved.

type Params = { params: Promise<{ projectId: string; recurrenceId: string }> };

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = updateRecurrenceSchema.parse(await request.json());
    return NextResponse.json(
      await RecurrenceService.update(actor, params.recurrenceId, input),
    );
  });
}

export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    await RecurrenceService.delete(actor, params.recurrenceId);
    return new NextResponse(null, { status: 204 });
  });
}
