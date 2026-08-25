import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { WebhookService } from "@/features/public-api/services/webhook.service";
import { createWebhookSchema } from "@/features/public-api/validation/public-api.schemas";

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = createWebhookSchema.parse(await request.json());
    return NextResponse.json(await WebhookService.create(actor, input), { status: 201 });
  });
}
