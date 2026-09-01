import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { BackfillService } from "@/features/code-integration/services/backfill.service";

// Disconnect: drop the credential, back to webhook-only (35 §4).
//
// The credential is deleted here; the app install itself lives on the git host
// and only somebody with admin rights there can remove it. The UI says so,
// because "disconnected" that leaves an install in place is the kind of half
// truth a security review finds.

type Params = { params: Promise<{ connectionId: string }> };

export async function DELETE(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    await BackfillService.disconnect(actor, params.connectionId);
    return new NextResponse(null, { status: 204 });
  });
}
