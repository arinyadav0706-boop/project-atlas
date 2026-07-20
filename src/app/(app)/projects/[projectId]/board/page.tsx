import { redirect, notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { BoardService } from "@/features/board/services/board.service";
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
    const [board, members] = await Promise.all([
      BoardService.getBoard(actor, params.projectId, {}),
      ProjectService.listMembers(actor, params.projectId),
    ]);
    return (
      <BoardView
        projectId={params.projectId}
        initialBoard={board}
        members={members.map((m) => ({ userId: m.userId, name: m.name }))}
      />
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
