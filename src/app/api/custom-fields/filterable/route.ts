import { NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";

// GET /api/custom-fields/filterable — fields at least one project has enabled.
//
// Deliberately NOT behind MANAGE_CUSTOM_FIELDS: that capability governs
// defining a field, not filtering by one. Someone who can see a field on an
// issue must be able to filter on it, or the field is decoration.
export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await CustomFieldService.filterable(actor));
  });
}
