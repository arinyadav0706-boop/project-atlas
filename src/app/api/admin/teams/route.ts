import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { TeamService } from "@/features/teams/services/team.service";
import { createTeamSchema } from "@/features/teams/validation/team.schemas";

// GET /api/admin/teams — teams with manager + member counts (MANAGE_TEAMS).
export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await TeamService.list(actor));
  });
}

// POST /api/admin/teams — create a team.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = createTeamSchema.parse(await request.json());
    return NextResponse.json(await TeamService.create(actor, input), { status: 201 });
  });
}
