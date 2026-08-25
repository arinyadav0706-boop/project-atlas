import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { WebhookService } from "@/features/public-api/services/webhook.service";
import { updateWebhookSchema } from "@/features/public-api/validation/public-api.schemas";

type Params = { params: Promise<{ webhookId: string }> };

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = updateWebhookSchema.parse(await request.json());
    return NextResponse.json(await WebhookService.update(actor, params.webhookId, input));
  });
}

export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    await WebhookService.delete(actor, params.webhookId);
    return new NextResponse(null, { status: 204 });
  });
}
