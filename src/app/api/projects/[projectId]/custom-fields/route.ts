import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor, requireMutationActor } from "@/features/authentication/services/actor.service";
import { CustomFieldService } from "@/features/custom-fields/services/custom-field.service";
import { setProjectFieldsSchema } from "@/features/custom-fields/validation/custom-field.schemas";

type Params = { params: Promise<{ projectId: string }> };

// Which fields this project shows, and in what order (BR-5). PUT replaces the
// whole set — the array's order IS the display order, so there is no separate
// reorder call to keep in step.
export async function GET(_request: NextRequest, props: Params) {
  const { projectId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await CustomFieldService.forProject(actor, projectId));
  });
}

export async function PUT(request: NextRequest, props: Params) {
  const { projectId } = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = setProjectFieldsSchema.parse(await request.json());
    return NextResponse.json(await CustomFieldService.setForProject(actor, projectId, input));
  });
}
