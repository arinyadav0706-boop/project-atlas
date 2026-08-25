import { NextRequest } from "next/server";
import { v1Route } from "@/features/public-api/lib/v1";
import { ProfileService } from "@/features/profile/services/profile.service";

// Who this token acts as (ADR-0052 §3). No scope: every token may ask, and it
// is the call every integration makes first to check its credentials work.

export async function GET(request: NextRequest) {
  return v1Route(request, null, async ({ actor }) => {
    const me = await ProfileService.getMyProfile(actor);
    return {
      id: me.id,
      name: me.name,
      email: me.email,
      organizationId: actor.organizationId,
      orgRole: actor.orgRole,
    };
  });
}
