import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { WebhookService } from "@/features/public-api/services/webhook.service";

type Params = { params: Promise<{ webhookId: string }> };

export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await WebhookService.deliveries(actor, params.webhookId));
  });
}
