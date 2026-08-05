import { NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { TeamService } from "@/features/teams/services/team.service";

// GET /api/teams/my — the caller's reports (managed users), for "My Team".
export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await TeamService.getMyTeam(actor));
  });
}
