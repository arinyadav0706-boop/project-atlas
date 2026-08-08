import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { FeatureFlagService } from "@/features/admin/services/feature-flag.service";
import { setFeatureFlagSchema } from "@/features/admin/validation/admin.schemas";

type Params = { params: Promise<{ key: string }> };

// PATCH /api/admin/feature-flags/{key} — set or reset an override, audited
// (13_admin.md, ADR-0023, MANAGE_FEATURE_FLAGS).
export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = setFeatureFlagSchema.parse(await request.json());
    return NextResponse.json(
      await FeatureFlagService.setOverride(actor, params.key, input),
    );
  });
}
