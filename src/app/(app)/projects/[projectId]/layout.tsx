import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ChevronRight, FolderKanban } from "lucide-react";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { RecentItemService } from "@/features/home/services/recent-item.service";
import { FavoriteService } from "@/features/home/services/favorite.service";
import { NotFoundError } from "@/shared/lib/errors";
import { Badge } from "@/shared/components/ui/badge";
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
    <AppFrame className="flex flex-col flex-1 min-h-0 space-y-5">
      {/* Unified Spatial Project Banner Card */}
      <div className="rounded-3xl border border-border/60 hero-mesh p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-indigo-500 to-google-purple text-sm font-bold font-mono text-white shadow-glow">
              {project.key.slice(0, 3)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                >
                  <FolderKanban className="h-3 w-3 text-primary" />
                  <span>Projects</span>
                </Link>
                <ChevronRight className="h-3 w-3" />
                <span className="rounded-full bg-primary/12 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                  {project.key}
                </span>
              </div>
              <h1 className="mt-1 truncate text-xl font-bold tracking-tight text-foreground md:text-2xl">
                {project.name}
              </h1>
              {project.description && (
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                  {project.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <StarProjectButton projectId={params.projectId} initialStarred={starred} />
            {project.status === "ARCHIVED" && <Badge variant="outline">Archived</Badge>}
          </div>
        </div>

        <div className="mt-4 pt-3.5 border-t border-border-subtle/70">
          <ProjectTabs projectId={params.projectId} />
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </AppFrame>
  );
}
