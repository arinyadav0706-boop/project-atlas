import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { RecentItemService } from "@/features/home/services/recent-item.service";
import { FavoriteService } from "@/features/home/services/favorite.service";
import { NotFoundError } from "@/shared/lib/errors";
import { Badge } from "@/shared/components/ui/badge";
import { PageHeader } from "@/shared/components/ui/page-header";
import { AppFrame } from "@/shared/components/ui/app-frame";
import { ProjectTabs } from "@/features/projects/components/project-tabs";
import { StarProjectButton } from "@/features/projects/components/star-project-button";

export default async function ProjectLayout(props: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const params = await props.params;
  const { children } = props;

  const actor = await getActor();
  if (!actor) redirect("/sign-in");

  let project;
  try {
    project = await ProjectService.get(actor, params.projectId);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  await RecentItemService.record(actor, "PROJECT", params.projectId, "VIEWED");
  const starred = await FavoriteService.isProjectStarred(actor, params.projectId);

  return (
    <AppFrame className="py-3 flex flex-col flex-1 min-h-0">
      {/* Sleek Google/Apple Compact Header with integrated Breadcrumb */}
      <div className="flex flex-col gap-1.5 mb-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link
            href="/projects"
            className="hover:text-foreground transition-colors"
          >
            Projects
          </Link>
          <ChevronRight className="h-3 w-3" />
          <span className="font-mono text-primary font-semibold">{project.key}</span>
        </div>

        <PageHeader
          compact
          icon={
            <span className="text-xs font-mono font-bold text-primary">{project.key}</span>
          }
          title={project.name}
          subtitle={project.description ?? undefined}
          actions={
            <div className="flex items-center gap-2">
              <StarProjectButton projectId={params.projectId} initialStarred={starred} />
              {project.status === "ARCHIVED" && <Badge variant="outline">Archived</Badge>}
            </div>
          }
        />
      </div>

      <ProjectTabs projectId={params.projectId} />

      <div className="pt-2 flex-1 min-h-0 flex flex-col">{children}</div>
    </AppFrame>
  );
}
