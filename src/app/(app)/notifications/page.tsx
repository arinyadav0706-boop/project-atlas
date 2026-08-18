import { redirect } from "next/navigation";
import { Bell } from "lucide-react";
import { getActor } from "@/features/authentication/services/actor.service";
import { NotificationService } from "@/features/notifications/services/notification.service";
import { NotificationsList } from "@/features/notifications/components/notifications-list";
import { PageHeader } from "@/shared/components/ui/page-header";

export default async function NotificationsPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const initial = await NotificationService.list(actor, {});
  return (
    // A reading column, like Profile: notifications are one-line messages, and
    // a full-width row leaves the timestamp stranded a screen from the text.
    <div className="mx-auto max-w-2xl">
      <PageHeader
        icon={<Bell />}
        title="Notifications"
        subtitle="Mentions and replies on issues you're involved in."
        className="mb-5"
      />
      <NotificationsList initial={initial} />
    </div>
  );
}
