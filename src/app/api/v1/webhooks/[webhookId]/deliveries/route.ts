import { NextRequest } from "next/server";
import { v1Route, pageSize } from "@/features/public-api/lib/v1";
import { WebhookService } from "@/features/public-api/services/webhook.service";

// The delivery log. The first thing anybody debugging an integration asks for,
// and the reason a webhook feature is supportable at all.

type Params = { params: Promise<{ webhookId: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return v1Route(request, "webhooks:manage", ({ actor, query }) =>
    WebhookService.deliveries(actor, params.webhookId, pageSize(query)),
  );
}
