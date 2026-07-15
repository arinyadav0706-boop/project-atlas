import { redirect, notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { IssueService } from "@/features/issues/services/issue.service";
import { NotFoundError } from "@/shared/lib/errors";
import { IssuesView } from "@/features/issues/components/issues-view";

export default async function ProjectIssuesPage({
  params,
}: {
  params: { projectId: string };
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  try {
    const [project, page, members] = await Promise.all([
      ProjectService.get(actor, params.projectId),
      IssueService.list(actor, params.projectId),
      ProjectService.listMembers(actor, params.projectId),
    ]);
    const canWrite =
      project.status === "ACTIVE" &&
      (project.myRole === "LEAD" || project.myRole === "MEMBER");
    return (
      <IssuesView
        projectId={params.projectId}
        initialItems={page.items}
        initialCursor={page.nextCursor}
        counts={page.counts}
        members={members.map((m) => ({ userId: m.userId, name: m.name }))}
        canWrite={canWrite}
      />
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
