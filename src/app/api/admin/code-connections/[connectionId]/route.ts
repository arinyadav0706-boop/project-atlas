import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { CodeIntegrationService } from "@/features/code-integration/services/code-integration.service";
import { updateConnectionSchema } from "@/features/code-integration/validation/code-integration.schemas";

type Params = { params: Promise<{ connectionId: string }> };

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = updateConnectionSchema.parse(await request.json());
    return NextResponse.json(
      await CodeIntegrationService.update(actor, params.connectionId, input),
    );
  });
}

export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    await CodeIntegrationService.delete(actor, params.connectionId);
    return new NextResponse(null, { status: 204 });
  });
}
