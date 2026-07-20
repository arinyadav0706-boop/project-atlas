import { NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { HomeService } from "@/features/home/services/home.service";

// GET /api/home — the composed Home payload (ADR-0012, 02_home.md). The
// server-rendered page streams sections individually; this endpoint returns the
// whole HomeDto for client refetch / future clients.
export async function GET() {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    return NextResponse.json(await HomeService.getHome(actor));
  });
}
