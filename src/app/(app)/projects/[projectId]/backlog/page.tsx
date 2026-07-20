import { redirect, notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { BacklogService } from "@/features/backlog/services/backlog.service";
import { SprintService } from "@/features/sprints/services/sprint.service";
import { NotFoundError } from "@/shared/lib/errors";
import { SprintPlanningView } from "@/features/sprints/components/sprint-planning-view";

export default async function ProjectBacklogPage({
  params,
}: {
  params: { projectId: string };
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  try {
    // The Backlog page is the planning view (ADR-0014): the current sprint
    // section over the backlog list, drag between them.
    const [sprintPanel, backlog] = await Promise.all([
      SprintService.getPanel(actor, params.projectId),
      BacklogService.getBacklog(actor, params.projectId, {}),
    ]);
    return (
      <SprintPlanningView
        projectId={params.projectId}
        initialSprint={sprintPanel}
        initialBacklog={backlog}
      />
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
