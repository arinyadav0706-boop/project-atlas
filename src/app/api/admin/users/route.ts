import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor, requireMutationActor } from "@/features/authentication/services/actor.service";
import { UserManagementService } from "@/features/user-management/services/user-management.service";
import {
  inviteUserSchema,
  userListQuerySchema,
} from "@/features/user-management/validation/user-management.schemas";

// GET /api/admin/users — paginated, filterable list (14_user_management.md, MANAGE_USERS).
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const query = userListQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams.entries()),
    );
    return NextResponse.json(await UserManagementService.list(actor, query));
  });
}

// POST /api/admin/users — invite a user (audited, MANAGE_USERS).
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = inviteUserSchema.parse(await request.json());
    return NextResponse.json(await UserManagementService.invite(actor, input), {
      status: 201,
    });
  });
}
