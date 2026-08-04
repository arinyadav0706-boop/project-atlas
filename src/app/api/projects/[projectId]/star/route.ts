import { NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { FavoriteService } from "@/features/home/services/favorite.service";

type Params = { params: { projectId: string } };

// Toggle a starred project for the Home strip (ADR-0012).
export async function POST(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await FavoriteService.starProject(actor, params.projectId);
    return NextResponse.json({ starred: true });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await FavoriteService.unstarProject(actor, params.projectId);
    return NextResponse.json({ starred: false });
  });
}
