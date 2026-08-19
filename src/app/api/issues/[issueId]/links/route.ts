import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { DependencyService } from "@/features/dependencies/services/dependency.service";
import { createLinkSchema } from "@/features/dependencies/validation/dependency.schemas";

// Dependencies on one issue (27_dependencies.md §4, ADR-0046).

type Params = { params: Promise<{ issueId: string }> };

export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await DependencyService.list(actor, params.issueId));
  });
}

export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = createLinkSchema.parse(await request.json());
    return NextResponse.json(
      await DependencyService.create(actor, params.issueId, input),
      { status: 201 },
    );
  });
}
