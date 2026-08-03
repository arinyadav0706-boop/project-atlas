import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { UserManagementService } from "@/features/user-management/services/user-management.service";
import { updateUserAdminSchema } from "@/features/user-management/validation/user-management.schemas";

type Params = { params: { userId: string } };

// PATCH /api/admin/users/{userId} — change org role and/or active status
// (audited, last-admin guard, MANAGE_USERS).
export async function PATCH(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateUserAdminSchema.parse(await request.json());
    return NextResponse.json(
      await UserManagementService.update(actor, params.userId, input),
    );
  });
}
