import { NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { FeatureFlagService } from "@/features/admin/services/feature-flag.service";

// GET /api/admin/feature-flags — the flag catalog + effective state for this org
// (13_admin.md, ADR-0023, MANAGE_FEATURE_FLAGS).
export async function GET() {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    return NextResponse.json({ flags: await FeatureFlagService.listForAdmin(actor) });
  });
}
