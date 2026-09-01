import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { BackfillService } from "@/features/code-integration/services/backfill.service";
import { setRepositoriesSchema } from "@/features/code-integration/validation/backfill.schemas";

// The repository work list (35 §4, BR-5).

type Params = { params: Promise<{ connectionId: string }> };

export async function GET(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    // `?refresh=1` asks the provider what the install can see now. Not the
    // default: it is several outbound calls, and rendering the screen should
    // not spend the git host's rate limit.
    const refresh = request.nextUrl.searchParams.get("refresh") === "1";
    const rows = refresh
      ? await BackfillService.refreshRepositories(actor, params.connectionId)
      : await BackfillService.listRepositories(actor, params.connectionId);
    return NextResponse.json(rows.map(toDto));
  });
}

export async function PATCH(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const input = setRepositoriesSchema.parse(await request.json());
    const rows = await BackfillService.setRepositoriesEnabled(actor, params.connectionId, input);
    return NextResponse.json(rows.map(toDto));
  });
}

function toDto(row: {
  id: string;
  path: string;
  defaultBranch: string | null;
  enabled: boolean;
  lastBackfillAt: Date | null;
}) {
  return {
    id: row.id,
    path: row.path,
    defaultBranch: row.defaultBranch,
    enabled: row.enabled,
    lastBackfillAt: row.lastBackfillAt?.toISOString() ?? null,
  };
}
