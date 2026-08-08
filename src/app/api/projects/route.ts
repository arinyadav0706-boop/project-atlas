import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { createProjectSchema } from "@/features/projects/validation/project.schemas";

export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await ProjectService.list(actor));
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = createProjectSchema.parse(await request.json());
    const project = await ProjectService.create(actor, input);
    return NextResponse.json(project, { status: 201 });
  });
}
