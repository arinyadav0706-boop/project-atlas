import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { ProjectSettingsView } from "@/features/projects/components/project-settings-view";
import { loadPageData } from "@/shared/lib/load-page-data";

export default async function ProjectSettingsPage(props: {
  params: Promise<{ projectId: string }>;
}) {
  const params = await props.params;
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const [project, members] = await loadPageData(() =>
    Promise.all([
      ProjectService.get(actor, params.projectId),
      ProjectService.listMembers(actor, params.projectId),
    ]),
  );

  return (
    <ProjectSettingsView
      project={project}
      members={members}
      currentUserId={actor.userId}
    />
  );
}
