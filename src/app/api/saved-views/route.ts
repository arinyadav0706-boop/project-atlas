import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { SavedViewService } from "@/features/saved-views/services/saved-view.service";
import { createSavedViewSchema } from "@/features/saved-views/validation/saved-view.schemas";

// GET  /api/saved-views — the caller's views plus everything shared (BR-4).
// POST /api/saved-views — create one. 409 on a duplicate name (BR-10).
export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await SavedViewService.list(actor));
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = createSavedViewSchema.parse(await request.json());
    return NextResponse.json(await SavedViewService.create(actor, input), { status: 201 });
  });
}
