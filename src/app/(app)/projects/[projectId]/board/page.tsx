import { redirect, notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { BoardService } from "@/features/board/services/board.service";
import { LabelService } from "@/features/labels/services/label.service";
import { ComponentService } from "@/features/components/services/component.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { SprintService } from "@/features/sprints/services/sprint.service";
import { NotFoundError } from "@/shared/lib/errors";
import { BoardView } from "@/features/board/components/board-view";

export default async function ProjectBoardPage({
  params,
}: {
  params: { projectId: string };
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  try {
    // Unfiltered board (project-level, ADR-0008) + the member list for the
    // assignee filter, fetched in parallel.
    const [board, members, labels, components, epics, sprints] = await Promise.all([
      BoardService.getBoard(actor, params.projectId, {}),
      ProjectService.listMembers(actor, params.projectId),
      LabelService.list(actor),
      ComponentService.list(actor, params.projectId),
      IssueService.listEpics(actor, params.projectId),
      // Feeds the Sprint filter control (FUT-4). A kanban project returns none
      // and the control simply doesn't render.
      SprintService.list(actor, params.projectId),
    ]);
    return (
      <BoardView
        projectId={params.projectId}
        initialBoard={board}
        members={members.map((m) => ({ userId: m.userId, name: m.name }))}
        labels={labels.items}
        components={components.items.map((c) => ({ id: c.id, name: c.name }))}
        epics={epics}
        sprints={sprints.map((s) => ({ id: s.id, name: s.name, status: s.status }))}
      />
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
