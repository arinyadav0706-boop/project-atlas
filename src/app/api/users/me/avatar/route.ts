import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError, ValidationError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProfileService } from "@/features/profile/services/profile.service";

// POST /api/users/me/avatar — multipart image upload (16_profile.md BR-4). The
// route only decodes the wire format; size/MIME live in the service.
export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("No image was provided.");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const profile = await ProfileService.setAvatar(actor, {
      mimeType: file.type || "application/octet-stream",
      buffer,
    });
    return NextResponse.json(profile);
  });
}

// DELETE /api/users/me/avatar — remove own avatar (BR-4).
export async function DELETE() {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    return NextResponse.json(await ProfileService.removeAvatar(actor));
  });
}
