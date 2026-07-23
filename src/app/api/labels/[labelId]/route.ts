import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { LabelService } from "@/features/labels/services/label.service";
import { updateLabelSchema } from "@/features/labels/validation/label.schemas";

type Params = { params: { labelId: string } };

// PATCH /api/labels/{id} — rename/recolor (manage-gated, BR-2).
export async function PATCH(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const input = updateLabelSchema.parse(await request.json());
    return NextResponse.json(await LabelService.update(actor, params.labelId, input));
  });
}

// DELETE /api/labels/{id} — soft delete (manage-gated, BR-2/BR-6).
export async function DELETE(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    await LabelService.delete(actor, params.labelId);
    return NextResponse.json({ ok: true });
  });
}
