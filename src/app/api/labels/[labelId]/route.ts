import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { LabelService } from "@/features/labels/services/label.service";
import { updateLabelSchema } from "@/features/labels/validation/label.schemas";

type Params = { params: Promise<{ labelId: string }> };

// PATCH /api/labels/{id} — rename/recolor (manage-gated, BR-2).
export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateLabelSchema.parse(await request.json());
    return NextResponse.json(await LabelService.update(actor, params.labelId, input));
  });
}

// DELETE /api/labels/{id} — soft delete (manage-gated, BR-2/BR-6).
export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await LabelService.delete(actor, params.labelId);
    return NextResponse.json({ ok: true });
  });
}
