import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { ComponentService } from "@/features/components/services/component.service";
import { updateComponentSchema } from "@/features/components/validation/component.schemas";

type Params = { params: { componentId: string } };

// PATCH /api/components/{id} — rename/edit/reassign lead (LEAD, BR-1).
export async function PATCH(request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateComponentSchema.parse(await request.json());
    return NextResponse.json(await ComponentService.update(actor, params.componentId, input));
  });
}

// DELETE /api/components/{id} — soft delete (LEAD, BR-1/BR-7).
export async function DELETE(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await ComponentService.delete(actor, params.componentId);
    return NextResponse.json({ ok: true });
  });
}
