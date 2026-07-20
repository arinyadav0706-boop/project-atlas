import { redirect, notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { BacklogService } from "@/features/backlog/services/backlog.service";
import { NotFoundError } from "@/shared/lib/errors";
import { BacklogView } from "@/features/backlog/components/backlog-view";

export default async function ProjectBacklogPage({
  params,
}: {
  params: { projectId: string };
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  try {
    const backlog = await BacklogService.getBacklog(actor, params.projectId, {});
    return <BacklogView projectId={params.projectId} initialBacklog={backlog} />;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
