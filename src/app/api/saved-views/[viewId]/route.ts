import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { SavedViewService } from "@/features/saved-views/services/saved-view.service";
import { updateSavedViewSchema } from "@/features/saved-views/validation/saved-view.schemas";

type Params = { params: Promise<{ viewId: string }> };

// PATCH  — rename / re-filter / re-share. Owner or org admin only (BR-5).
// DELETE — soft delete (BR-11). Same authority.
export async function PATCH(request: NextRequest, props: Params) {
  const { viewId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = updateSavedViewSchema.parse(await request.json());
    return NextResponse.json(await SavedViewService.update(actor, viewId, input));
  });
}

export async function DELETE(_request: NextRequest, props: Params) {
  const { viewId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    await SavedViewService.remove(actor, viewId);
    return new NextResponse(null, { status: 204 });
  });
}
