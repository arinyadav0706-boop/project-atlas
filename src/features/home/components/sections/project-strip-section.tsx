import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection } from "@/features/home/components/home-section";
import { StarButton } from "@/features/home/components/star-button";
import { Badge } from "@/shared/components/ui/badge";
import type { Actor } from "@/shared/types/actor";
import type { HomeProjectDto } from "@/features/home/types/home.types";

// Personal navigation strip — starred (explicit) then recent (implicit). NOT
// the catalog (that's the Projects module). Always shows a path to Projects.
export async function ProjectStripSection({ actor }: { actor: Actor }) {
  const { starredProjects, recentProjects } = await HomeService.projectStrip(actor);
  const projects = [...starredProjects, ...recentProjects];

  return (
    <HomeSection title="Projects" viewAll={{ href: "/projects", label: "All projects" }}>
      {projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-border bg-surface/50 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-accent/40 hover:text-foreground"
        >
          Browse projects
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </HomeSection>
  );
}

function ProjectCard({ project }: { project: HomeProjectDto }) {
  return (
    <Link
      href={`/projects/${project.id}/issues`}
      className="group flex items-start justify-between gap-2 rounded-xl border border-border bg-background p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
    >
      <div className="min-w-0">
        <Badge variant="accent">{project.key}</Badge>
        <p className="mt-2 truncate text-sm font-medium text-foreground">{project.name}</p>
      </div>
      <StarButton projectId={project.id} initialStarred={project.starred} />
    </Link>
  );
}
