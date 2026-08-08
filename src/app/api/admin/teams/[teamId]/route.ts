import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { TeamService } from "@/features/teams/services/team.service";
import { updateTeamSchema } from "@/features/teams/validation/team.schemas";

type Params = { params: Promise<{ teamId: string }> };

// GET — team detail (name, manager, parent, members).
export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await TeamService.getDetail(actor, params.teamId));
  });
}

// PATCH — rename / set manager / set parent (cycle-checked).
export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateTeamSchema.parse(await request.json());
    return NextResponse.json(await TeamService.update(actor, params.teamId, input));
  });
}

// DELETE — soft-delete, re-parent children, detach members (BR-6).
export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await TeamService.remove(actor, params.teamId);
    return NextResponse.json({ ok: true });
  });
}
