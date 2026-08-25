import { NextRequest } from "next/server";
import { v1Route, noContent } from "@/features/public-api/lib/v1";
import { WebhookService } from "@/features/public-api/services/webhook.service";
import { updateWebhookSchema } from "@/features/public-api/validation/public-api.schemas";

type Params = { params: Promise<{ webhookId: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "webhooks:manage", async ({ actor }) => {
    const rows = await WebhookService.list(actor);
    const found = rows.find((w) => w.id === params.webhookId);
    if (!found) {
      // Through the service so the tenant-scope 404 is the same one every
      // other path produces (F-1).
      await WebhookService.require(actor, params.webhookId);
    }
    return found;
  });
}

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "webhooks:manage", async ({ actor }) => {
    const input = updateWebhookSchema.parse(await request.json());
    return WebhookService.update(actor, params.webhookId, input);
  });
}

export async function DELETE(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "webhooks:manage", async ({ actor }) => {
    await WebhookService.delete(actor, params.webhookId);
    return noContent();
  });
}
