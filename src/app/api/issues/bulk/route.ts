import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { BulkEditService } from "@/features/bulk-edit/services/bulk-edit.service";
import { bulkEditSchema } from "@/features/bulk-edit/validation/bulk-edit.schemas";

// POST /api/issues/bulk — apply one change set across a selection
// (23_bulk_edit.md §4, ADR-0041).
//
// Always 200 when the REQUEST is well-formed, even if every issue failed: the
// HTTP status describes the request, and the per-issue outcomes live in the
// body (BR-3). A 400 means the request itself was wrong — no ids, over the cap,
// or no fields to change.
//
// `requireMutationActor` applies the standard per-user mutation rate limit,
// so one endpoint cannot be used to sidestep it by batching.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    const input = bulkEditSchema.parse(await request.json());
    return NextResponse.json(await BulkEditService.apply(actor, input));
  });
}
