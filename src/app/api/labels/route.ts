import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { LabelService } from "@/features/labels/services/label.service";
import { createLabelSchema } from "@/features/labels/validation/label.schemas";

// GET /api/labels — all labels in the org, plus the viewer's create/manage
// rights (17_labels.md). POST — create a label (any member, BR-1).
export async function GET() {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    return NextResponse.json(await LabelService.list(actor));
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const input = createLabelSchema.parse(await request.json());
    return NextResponse.json(await LabelService.create(actor, input), { status: 201 });
  });
}
