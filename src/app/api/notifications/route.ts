import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { NotificationService } from "@/features/notifications/services/notification.service";

// GET /api/notifications?cursor=&take= — the current user's notifications,
// newest first, keyset-paginated, with the unread count (10_notifications.md).
export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const actor = await requireActor();
    const q = request.nextUrl.searchParams;
    const takeParam = q.get("take");
    return NextResponse.json(
      await NotificationService.list(actor, {
        cursor: q.get("cursor") ?? undefined,
        take: takeParam ? Number(takeParam) : undefined,
      }),
    );
  });
}
