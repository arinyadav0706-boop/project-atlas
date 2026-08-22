import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { AutomationService } from "@/features/automations/services/automation.service";
import { updateAutomationSchema } from "@/features/automations/validation/automation.schemas";

// One rule: rename, enable/disable, replace the document, or soft-delete
// (31_automations.md §4). The rule id is the addressable thing; `projectId` is
// in the path for symmetry with the rest of the project surface, and the
// service resolves the rule's own project so the two can never disagree.

type Params = { params: Promise<{ projectId: string; ruleId: string }> };

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = updateAutomationSchema.parse(await request.json());
    return NextResponse.json(await AutomationService.update(actor, params.ruleId, input));
  });
}

export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    await AutomationService.delete(actor, params.ruleId);
    return new NextResponse(null, { status: 204 });
  });
}
