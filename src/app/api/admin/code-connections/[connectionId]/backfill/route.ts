import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { BackfillService } from "@/features/code-integration/services/backfill.service";

// Start a backfill, and read its progress (35 §4).

type Params = { params: Promise<{ connectionId: string }> };

export async function POST(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    // Queues a run per enabled repository AND drains one slice inline, so the
    // button does something visible on a deployment with no cron (35/BR-12).
    return NextResponse.json(await BackfillService.start(actor, params.connectionId));
  });
}

export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    const { repositories, runs } = await BackfillService.status(actor, params.connectionId);
    return NextResponse.json({
      repositories: repositories.map((row) => ({
        id: row.id,
        path: row.path,
        defaultBranch: row.defaultBranch,
        enabled: row.enabled,
        lastBackfillAt: row.lastBackfillAt?.toISOString() ?? null,
      })),
      runs: runs.map((run) => ({
        id: run.id,
        repositoryId: run.repositoryId,
        status: run.status,
        phase: run.phase,
        scanned: run.scanned,
        linked: run.linked,
        resumeAfter: run.resumeAfter?.toISOString() ?? null,
        error: run.error,
        since: run.since.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
      })),
    });
  });
}
