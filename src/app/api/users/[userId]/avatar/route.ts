import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { UnauthorizedError } from "@/shared/lib/errors";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProfileService } from "@/features/profile/services/profile.service";

type Params = { params: { userId: string } };

// GET /api/users/{userId}/avatar — org-scoped proxy of a user's avatar bytes
// (16_profile.md BR-4/F-1). This is the URL rendered in <img> across the app.
// Content-type is sniffed from the bytes; the caller's avatarUrl carries a
// cache-busting token, so a long private cache is safe (a new upload = new URL).
export async function GET(_request: NextRequest, { params }: Params) {
  return handleRoute(async () => {
    const actor = await getActor();
    if (!actor) throw new UnauthorizedError();
    const { mimeType, body } = await ProfileService.getAvatarBytes(actor, params.userId);
    return new NextResponse(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=300",
      },
    });
  });
}
