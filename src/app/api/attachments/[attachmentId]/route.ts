import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { AttachmentService } from "@/features/attachments/services/attachment.service";

type Params = { params: { attachmentId: string } };

// DELETE /api/attachments/{attachmentId} — the uploader, or a project LEAD,
// removes the file (BR-1/BR-6). Soft-deletes the row; blob removal is best-effort.
export async function DELETE(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    await AttachmentService.delete(actor, params.attachmentId);
    return NextResponse.json({ ok: true });
  });
}
