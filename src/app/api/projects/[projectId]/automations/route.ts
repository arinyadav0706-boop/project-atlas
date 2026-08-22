import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { AutomationService } from "@/features/automations/services/automation.service";
import { createAutomationSchema } from "@/features/automations/validation/automation.schemas";

// A project's automation rules (31_automations.md §4, ADR-0050).
//
// GET is open to anyone who can see the project (BR-9) — automated behaviour
// that only admins can explain is worse than no automation. POST is LEAD-only,
// enforced in the service.

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await AutomationService.list(actor, params.projectId));
  });
}

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = createAutomationSchema.parse(await request.json());
    return NextResponse.json(
      await AutomationService.create(actor, params.projectId, input),
      { status: 201 },
    );
  });
}
