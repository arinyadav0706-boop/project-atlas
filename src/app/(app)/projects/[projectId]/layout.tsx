import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { NotFoundError } from "@/shared/lib/errors";
import { Badge } from "@/shared/components/ui/badge";
import { ProjectTabs } from "@/features/projects/components/project-tabs";

// Shared project shell: back-link, title, and tab nav around every
// project-scoped page (Issues, Settings, …). Fetched once here so pages
// render only their own content.
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { projectId: string };
}) {
  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  let project;
  try {
    project = await ProjectService.get(actor, params.projectId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/projects"
        className="mb-5 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="h-4 w-4" />
        Projects
      </Link>

      <div className="mb-4 flex items-center gap-3">
        <Badge variant="accent">{project.key}</Badge>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {project.name}
        </h1>
        {project.status === "ARCHIVED" && <Badge variant="outline">Archived</Badge>}
      </div>

      <ProjectTabs projectId={params.projectId} />

      <div className="pt-6">{children}</div>
    </div>
  );
}
