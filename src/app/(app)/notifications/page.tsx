import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { NotificationService } from "@/features/notifications/services/notification.service";
import { NotificationsList } from "@/features/notifications/components/notifications-list";

export default async function NotificationsPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const initial = await NotificationService.list(actor, {});
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-lg font-semibold text-foreground">Notifications</h1>
      <NotificationsList initial={initial} />
    </div>
  );
}
