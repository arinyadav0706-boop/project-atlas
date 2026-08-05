import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TeamService } from "@/features/teams/services/team.service";
import { addTeamMemberSchema } from "@/features/teams/validation/team.schemas";

type Params = { params: { teamId: string } };

// POST /api/admin/teams/{teamId}/members — add a user (moves if already teamed).
export async function POST(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const { userId } = addTeamMemberSchema.parse(await request.json());
    await TeamService.addMember(actor, params.teamId, userId);
    return NextResponse.json({ ok: true }, { status: 201 });
  });
}
