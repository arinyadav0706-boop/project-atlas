import { NextRequest } from "next/server";
import { v1Route, created } from "@/features/public-api/lib/v1";
import { WebhookService } from "@/features/public-api/services/webhook.service";
import { createWebhookSchema } from "@/features/public-api/validation/public-api.schemas";

// Webhooks over the API, so an integration can register its own endpoint at
// install time rather than asking a human to paste a URL into settings.

export async function GET(request: NextRequest) {
  return v1Route(request, "webhooks:manage", ({ actor }) => WebhookService.list(actor));
}

export async function POST(request: NextRequest) {
  return v1Route(request, "webhooks:manage", async ({ actor }) => {
    const input = createWebhookSchema.parse(await request.json());
    // The response carries the signing secret. The only time it is ever
    // returned — there is no endpoint that can read it back.
    return created(await WebhookService.create(actor, input));
  });
}
