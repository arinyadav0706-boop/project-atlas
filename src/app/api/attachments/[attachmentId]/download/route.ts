import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { AttachmentService } from "@/features/attachments/services/attachment.service";

type Params = { params: { attachmentId: string } };

// GET /api/attachments/{attachmentId}/download — RBAC-gated proxy of the blob
// bytes (BR-5, ADR-0017). No public URL is ever exposed; every download passes
// through the service's tenant + role check.
export async function GET(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();

    const { fileName, mimeType, body } = await AttachmentService.download(
      actor,
      params.attachmentId,
    );
    // Content-Disposition uses the RFC 5987 filename* form so non-ASCII names
    // survive; `attachment` forces a download rather than inline rendering.
    const encoded = encodeURIComponent(fileName);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(body.byteLength),
        "Content-Disposition": `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
        // Blobs are immutable and access is per-request authorized; no caching.
        "Cache-Control": "private, no-store",
      },
    });
  });
}
