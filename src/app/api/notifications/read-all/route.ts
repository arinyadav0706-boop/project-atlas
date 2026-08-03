import { NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { NotificationService } from "@/features/notifications/services/notification.service";

// POST /api/notifications/read-all — mark all of the user's notifications read.
export async function POST() {
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await NotificationService.markAllRead(actor);
    return NextResponse.json({ ok: true });
  });
}
