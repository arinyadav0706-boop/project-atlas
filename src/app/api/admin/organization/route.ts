import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor, requireMutationActor } from "@/features/authentication/services/actor.service";
import { OrganizationService } from "@/features/admin/services/organization.service";
import { updateOrganizationSchema } from "@/features/admin/validation/admin.schemas";

// GET/PATCH /api/admin/organization — org settings (13_admin.md, MANAGE_ORGANIZATION).
export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await OrganizationService.getSettings(actor));
  });
}

export async function PATCH(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateOrganizationSchema.parse(await request.json());
    return NextResponse.json(await OrganizationService.updateSettings(actor, input));
  });
}
