import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor, requireMutationActor } from "@/features/authentication/services/actor.service";
import { ProfileService } from "@/features/profile/services/profile.service";
import { updateProfileSchema } from "@/features/profile/validation/profile.schemas";

// GET /api/users/me — the caller's own profile (16_profile.md).
export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await ProfileService.getMyProfile(actor));
  });
}

// PATCH /api/users/me — update own name / notifications toggle (BR-1/BR-2). The
// strict schema rejects privileged fields (BR-3/AC-3).
export async function PATCH(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateProfileSchema.parse(await request.json());
    return NextResponse.json(await ProfileService.updateMyProfile(actor, input));
  });
}
