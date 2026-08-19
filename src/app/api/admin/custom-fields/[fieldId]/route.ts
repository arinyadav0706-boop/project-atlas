import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { updateCustomFieldSchema } from "@/features/custom-fields/validation/custom-field.schemas";

type Params = { params: Promise<{ fieldId: string }> };

// PATCH — rename, describe, toggle required, edit options. A `type` in the body
// is rejected by the schema's `.strict()`: the type is immutable (BR-2), and a
// silent no-op would be worse than an error.
export async function PATCH(request: NextRequest, props: Params) {
  const { fieldId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = updateCustomFieldSchema.parse(await request.json());
    return NextResponse.json(await CustomFieldService.update(actor, fieldId, input));
  });
}

export async function DELETE(_request: NextRequest, props: Params) {
  const { fieldId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await CustomFieldService.remove(actor, fieldId);
    return new NextResponse(null, { status: 204 });
  });
}
