import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor, requireMutationActor } from "@/features/authentication/services/actor.service";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { createCustomFieldSchema } from "@/features/custom-fields/validation/custom-field.schemas";

// The org field library (24_custom_fields.md §4). MANAGE_CUSTOM_FIELDS is
// checked in the service, not here — the capability is a business rule.
export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await CustomFieldService.list(actor));
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = createCustomFieldSchema.parse(await request.json());
    return NextResponse.json(await CustomFieldService.create(actor, input), { status: 201 });
  });
}
