import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { SearchService } from "@/features/search/services/search.service";
import { searchQuerySchema } from "@/features/search/validation/search.schemas";
import { enforceRateLimit, RateLimitRules } from "@/shared/lib/rate-limit";

// GET /api/search?q= — global search across issues and projects the caller's
// org can see (12_search.md, ADR-0021). Any authenticated member may call it.
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    // Throttle the expensive FTS path per user (ADR-0028).
    await enforceRateLimit("search", actor.userId, RateLimitRules.search);
    const { q } = searchQuerySchema.parse({
      q: request.nextUrl.searchParams.get("q") ?? "",
    });
    return NextResponse.json(await SearchService.search(actor, q));
  });
}
