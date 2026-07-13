import { redirect } from "next/navigation";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { ProjectsView } from "@/features/projects/components/projects-view";

// Server components fetch through the service layer directly (same seam
// Route Handlers use); client-side mutations go through /api routes. The
// layering (UI → service → repository) is unchanged either way.
export default async function ProjectsPage() {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  const projects = await ProjectService.list(actor);

  return <ProjectsView projects={projects} />;
}
