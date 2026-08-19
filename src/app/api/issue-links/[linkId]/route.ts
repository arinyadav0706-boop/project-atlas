import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { DependencyService } from "@/features/dependencies/services/dependency.service";

// Removing a link is addressed by the LINK's id, not by a pair of issue ids:
// one row, one identity, and the caller does not have to know which end it was
// stored from (ADR-0046 §2).

type Params = { params: Promise<{ linkId: string }> };

export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await DependencyService.remove(actor, params.linkId);
    return new NextResponse(null, { status: 204 });
  });
}
