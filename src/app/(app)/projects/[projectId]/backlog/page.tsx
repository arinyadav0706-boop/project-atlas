import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { BacklogService } from "@/features/backlog/services/backlog.service";
import { SprintService } from "@/features/sprints/services/sprint.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { LabelService } from "@/features/labels/services/label.service";
import { ComponentService } from "@/features/components/services/component.service";
import { SprintPlanningView } from "@/features/sprints/components/sprint-planning-view";
import { loadPageData } from "@/shared/lib/load-page-data";

export default async function ProjectBacklogPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  const params = await props.params;
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  // The Backlog page is the planning view (ADR-0014): the current sprint
  // section over the backlog list, drag between them.
  // The unfiltered backlog plus everything the filter bar needs to render
  // its options, fetched in parallel (same shape as the Board page).
  const [sprintPanel, backlog, epics, members, labels, components] = await loadPageData(
    () =>
      Promise.all([
        SprintService.getPanel(actor, params.projectId),
        BacklogService.getBacklog(actor, params.projectId, {}),
        IssueService.listEpics(actor, params.projectId),
        ProjectService.listMembers(actor, params.projectId),
        LabelService.list(actor),
        ComponentService.list(actor, params.projectId),
      ]),
  );

  return (
    <SprintPlanningView
      projectId={params.projectId}
      initialSprint={sprintPanel}
      initialBacklog={backlog}
      epics={epics}
      members={members.map((m) => ({ userId: m.userId, name: m.name }))}
      labels={labels.items}
      components={components.items.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
