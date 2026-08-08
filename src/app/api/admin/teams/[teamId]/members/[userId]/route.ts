import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { TeamService } from "@/features/teams/services/team.service";

type Params = { params: Promise<{ teamId: string; userId: string }> };

// DELETE /api/admin/teams/{teamId}/members/{userId} — remove a member.
export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await TeamService.removeMember(actor, params.teamId, params.userId);
    return NextResponse.json({ ok: true });
  });
}
