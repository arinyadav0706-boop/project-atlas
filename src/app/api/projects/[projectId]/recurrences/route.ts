import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { RecurrenceService } from "@/features/recurrence/services/recurrence.service";
import { createRecurrenceSchema } from "@/features/recurrence/validation/recurrence.schemas";

// A project's recurring work (32_recurring.md §4, ADR-0051).
//
// GET is open to anyone who can see the project (BR-12) — the person asking
// "where did this ticket come from" is rarely the person who set it up. POST is
// LEAD-only, enforced in the service.

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await RecurrenceService.list(actor, params.projectId));
  });
}

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = createRecurrenceSchema.parse(await request.json());
    return NextResponse.json(
      await RecurrenceService.create(actor, params.projectId, input),
      { status: 201 },
    );
  });
}
