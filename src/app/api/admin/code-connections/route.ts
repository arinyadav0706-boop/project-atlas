import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { CodeIntegrationService } from "@/features/code-integration/services/code-integration.service";
import { createConnectionSchema } from "@/features/code-integration/validation/code-integration.schemas";

// Org ADMIN only, enforced in the service (BR-10).

/** The origin this request arrived on, so the webhook URL is copy-pasteable. */
function originOf(request: NextRequest): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  return host ? `${protocol}://${host}` : "";
}

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await CodeIntegrationService.list(actor, originOf(request)));
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = createConnectionSchema.parse(await request.json());
    // The response carries the secret. The only time it is ever returned.
    return NextResponse.json(
      await CodeIntegrationService.create(actor, input, originOf(request)),
      { status: 201 },
    );
  });
}
