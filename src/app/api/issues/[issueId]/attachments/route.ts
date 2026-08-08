import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { ValidationError } from "@/shared/lib/errors";
import {
  requireActor,
  requireMutationActor,
} from "@/features/authentication/services/actor.service";
import { AttachmentService } from "@/features/attachments/services/attachment.service";

type Params = { params: Promise<{ issueId: string }> };

// GET /api/issues/{issueId}/attachments — the issue's attachments, oldest-first
// (09_attachments.md BR-5). Returns { items, canUpload } so the UI can gate.
export async function GET(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json(await AttachmentService.list(actor, params.issueId));
  });
}

// POST /api/issues/{issueId}/attachments — multipart upload (MEMBER/LEAD, BR-1).
// The route only decodes the wire format; size/MIME/RBAC live in the service.
export async function POST(request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("No file was provided.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const attachment = await AttachmentService.upload(actor, params.issueId, {
      fileName: file.name,
      // Browsers set the MIME on the File; the service validates it against the
      // allow-list, so an empty/spoofed type is rejected there.
      mimeType: file.type || "application/octet-stream",
      buffer,
    });
    return NextResponse.json(attachment, { status: 201 });
  });
}
