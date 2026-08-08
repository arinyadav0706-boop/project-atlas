import { NextRequest, NextResponse } from "next/server";
import { handleRoute } from "@/shared/lib/api";
import { requireMutationActor } from "@/features/authentication/services/actor.service";
import { NotificationService } from "@/features/notifications/services/notification.service";

type Params = { params: Promise<{ notificationId: string }> };

// POST /api/notifications/{id}/read — mark one notification read (own only).
export async function POST(_request: NextRequest, props: Params) {
  const params = await props.params;
  return handleRoute(async () => {
    const actor = await requireMutationActor();
    await NotificationService.markRead(actor, params.notificationId);
    return NextResponse.json({ ok: true });
  });
}
