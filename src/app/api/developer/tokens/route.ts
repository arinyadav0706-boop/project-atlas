import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { ApiTokenService } from "@/features/public-api/services/api-token.service";
import { WebhookService } from "@/features/public-api/services/webhook.service";
import { createTokenSchema } from "@/features/public-api/validation/public-api.schemas";
import type { DeveloperSettingsDto } from "@/features/public-api/types/public-api.types";

// The Developer settings page (33_public_api.md §6). Session-authenticated, on
// the INTERNAL surface — a token cannot be used to mint another token, which
// would turn one leaked credential into a permanent foothold.

export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    const isAdmin = actor.orgRole === "ADMIN";
    const payload: DeveloperSettingsDto = {
      tokens: await ApiTokenService.list(actor),
      // Webhooks are org-wide and admin-only (BR-12); a member sees the token
      // half of the page and nothing about webhooks.
      webhooks: isAdmin ? await WebhookService.list(actor) : [],
      canManageWebhooks: isAdmin,
    };
    return NextResponse.json(payload);
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = createTokenSchema.parse(await request.json());
    // The response carries the plaintext. The only time it exists outside the
    // caller's hands (BR-4).
    return NextResponse.json(await ApiTokenService.create(actor, input), { status: 201 });
  });
}
