import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { AutomationService } from "@/features/automations/services/automation.service";
import { runLogQuerySchema } from "@/features/automations/validation/automation.schemas";

// The rule audit log (31_automations.md §4, ADR-0050 §6).
//
// Readable by anyone who can see the project (BR-9): "why did my ticket change"
// is asked by the person it happened to, not by the person who wrote the rule.

type Params = { params: Promise<{ projectId: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const q = request.nextUrl.searchParams;
    const query = runLogQuerySchema.parse({
      // `?ruleId=` with nothing after it is a client that has cleared its
      // filter, not a request for the rule named "". Same trap the issue
      // filter parser fell into (FILT-2).
      ...(q.get("ruleId")?.trim() ? { ruleId: q.get("ruleId")!.trim() } : {}),
      ...(q.get("take")?.trim() ? { take: q.get("take")!.trim() } : {}),
    });
    return NextResponse.json(await AutomationService.runLog(actor, params.projectId, query));
  });
}
