import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { RecentItemService } from "@/features/home/services/recent-item.service";
import { FavoriteService } from "@/features/home/services/favorite.service";
import { NotFoundError } from "@/shared/lib/errors";
import { Badge } from "@/shared/components/ui/badge";
import { AppFrame, WorkspaceHeader } from "@/shared/components/layout/app-frame";
import { ProjectTabs } from "@/features/projects/components/project-tabs";
import { StarProjectButton } from "@/features/projects/components/star-project-button";

// The shell around every project-scoped page (Issues, Board, Backlog, …),
// fetched once here so the pages render only their own content.
//
// Migrated to the V2 frame with the Board (07_Migration_Plan.md), and it had to
// be: a board whose columns scroll independently needs a container with a known
// height, and `PageShell` capped the width and let the document scroll. The old
// shell cost ~150px above the first card — a back-link on its own line, a 26px
// title with a subtitle under it, then tabs. It is now 44 + 36.
//
// The subtitle is not deleted, it moves: `description` renders as the title's
// tooltip, the same trade `/issues` made.
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

  // Best-effort engagement signal for Home's "recent projects" (ADR-0012).
  // Recorded at the layer that already resolved the project, so ProjectService
  // stays free of a home dependency.
  await RecentItemService.record(actor, "PROJECT", params.projectId, "VIEWED");
  const starred = await FavoriteService.isProjectStarred(actor, params.projectId);

  return (
    <AppFrame>
      <WorkspaceHeader
        // The back-link becomes a breadcrumb rather than its own line. Same
        // destination, same one click, 28px less chrome on every project page.
        breadcrumb={
          <>
            <Link
              href="/projects"
              className="rounded-chip transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              Projects
            </Link>
            <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden />
            <span className="font-mono text-foreground">{project.key}</span>
            <ChevronRight className="size-3 shrink-0 opacity-60" aria-hidden />
          </>
        }
        title={project.name}
        description={project.description ?? undefined}
        actions={
          <>
            <StarProjectButton projectId={params.projectId} initialStarred={starred} />
            {project.status === "ARCHIVED" && <Badge variant="outline">Archived</Badge>}
          </>
        }
      />

      {/* TabNav draws its own bottom border and owns its height — the same
          control, at the same size, as the admin console's. Wrapping it in a
          fixed-height strip would have given it a second border. */}
      <ProjectTabs projectId={params.projectId} className="shrink-0 px-4" />

      {/* Padded, because six of the seven pages inside are still V1 and expect
          it. The Board cancels it with `Bleed` so its columns can reach the
          bottom of the viewport. Both go away together when the last project
          page is migrated. */}
      <div className="min-h-0 flex-1 overflow-auto p-5">{children}</div>
    </AppFrame>
  );
}
