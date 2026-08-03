import { NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireActor } from "@/features/authentication/services/actor.service";
import { NotificationService } from "@/features/notifications/services/notification.service";

// GET /api/notifications/unread-count — a light poll for the bell badge.
export async function GET() {
  return handleRoute(async () => {
    const actor = await requireActor();
    return NextResponse.json({ count: await NotificationService.unreadCount(actor) });
  });
}
