import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getActor } from "@/features/authentication/services/actor.service";
import { ProjectService } from "@/features/projects/services/project.service";
import { RecentItemService } from "@/features/home/services/recent-item.service";
import { FavoriteService } from "@/features/home/services/favorite.service";
import { NotFoundError } from "@/shared/lib/errors";
import { Badge } from "@/shared/components/ui/badge";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PageShell } from "@/shared/components/ui/page-shell";
import { ProjectTabs } from "@/features/projects/components/project-tabs";
import { StarProjectButton } from "@/features/projects/components/star-project-button";

// Shared project shell: back-link, title, and tab nav around every
// project-scoped page (Issues, Settings, …). Fetched once here so pages
// render only their own content.
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
    // `wide`: project pages carry the board, the issue table and the backlog —
    // the densest surfaces in the app. They were capped at max-w-5xl, narrower
    // than Workload, so moving between them shifted the content column.
    <PageShell width="wide">
      <Link
        href="/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Projects
      </Link>

      {/* The project key is this page's icon chip — the same slot Home,
          Workload and Admin fill with a lucide glyph, carrying identity
          instead of decoration. */}
      <PageHeader
        icon={
          <span className="text-[13px] font-semibold tracking-tight">{project.key}</span>
        }
        title={project.name}
        subtitle={project.description ?? undefined}
        actions={
          <>
            <StarProjectButton projectId={params.projectId} initialStarred={starred} />
            {project.status === "ARCHIVED" && <Badge variant="outline">Archived</Badge>}
          </>
        }
        className="mb-5"
      />

      <ProjectTabs projectId={params.projectId} />

      <div className="pt-5">{children}</div>
    </PageShell>
  );
}
