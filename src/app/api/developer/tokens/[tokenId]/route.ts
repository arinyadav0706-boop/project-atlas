import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { ApiTokenService } from "@/features/public-api/services/api-token.service";

// Revoke, never delete: the row is what answers "was this token used, and
// when" after an incident.

type Params = { params: Promise<{ tokenId: string }> };

export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    await ApiTokenService.revoke(actor, params.tokenId);
    return new NextResponse(null, { status: 204 });
  });
}
