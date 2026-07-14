import { redirect, notFound } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { NotFoundError } from "@/shared/lib/errors";
import { ProjectSettingsView } from "@/features/projects/components/project-settings-view";

export default async function ProjectSettingsPage({
  params,
}: {
  params: { projectId: string };
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  try {
    const [project, members] = await Promise.all([
      ProjectService.get(actor, params.projectId),
      ProjectService.listMembers(actor, params.projectId),
    ]);
    return (
      <ProjectSettingsView
        project={project}
        members={members}
        currentUserId={actor.userId}
      />
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
}
