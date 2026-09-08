import Link from "next/link";
import { cn } from "@/shared/lib/utils";
import { ArrowRight } from "lucide-react";
import { FolderOpen } from "lucide-react";
import { HomeService } from "@/features/home/services/home.service";
import { HomeSection } from "@/features/home/components/home-section";
import { StarButton } from "@/features/home/components/star-button";
import type { Actor } from "@/shared/types/actor";
import type { HomeProjectDto } from "@/features/home/types/home.types";

// Personal navigation strip — starred (explicit) then recent (implicit). NOT
// the catalog (that's the Projects module). Always shows a path to Projects.
export async function ProjectStripSection({ actor }: { actor: Actor }) {
  const { starredProjects, recentProjects } = await HomeService.projectStrip(actor);
  const projects = [...starredProjects, ...recentProjects];

  return (
    <HomeSection
      title="Projects"
      icon={<FolderOpen />}
      viewAll={{ href: "/projects", label: "View all projects" }}
    >
      {projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      ) : (
        <Link
          href="/projects"
          className="inline-flex items-center gap-1.5 rounded-control border border-dashed border-border px-3 py-2 text-body text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"
        >
          Browse projects
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </HomeSection>
  );
}

// Colour is derived from the project key, not stored: a stable hash means the
// same project keeps the same tile across sessions and machines without adding
// a column nobody would ever edit. Six tones, all from semantic tokens.
const TILE_TONES = [
  "bg-accent/15 text-accent",
  "bg-success/15 text-success",
  "bg-warning/15 text-warning",
  "bg-destructive/15 text-destructive",
  "bg-foreground/10 text-foreground",
  "bg-accent/25 text-accent",
] as const;

function toneFor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TILE_TONES[hash % TILE_TONES.length]!;
}

function ProjectCard({ project }: { project: HomeProjectDto }) {
  return (
    <div className="group relative flex items-start gap-3 rounded-control border border-border bg-background p-3 transition-shadow hover:shadow-card-hover">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-control text-label font-semibold",
          toneFor(project.key),
        )}
      >
        {project.key.slice(0, 2)}
      </span>

      <Link
        href={`/projects/${project.id}/issues`}
        className="min-w-0 flex-1 rounded-chip focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span className="block truncate text-body font-medium text-foreground">
          {project.name}
        </span>
        <span className="mt-0.5 line-clamp-1 block text-meta leading-snug text-muted-foreground">
          {project.description || "No description"}
        </span>
        {/* Covers the card so the whole tile is clickable, while the star stays
            above it in stacking order. */}
        <span className="absolute inset-0" aria-hidden />
      </Link>

      <span className="relative shrink-0">
        {/* Outside the link, and above the covering span: starring must not
            navigate. */}
        <StarButton projectId={project.id} initialStarred={project.starred} />
      </span>
    </div>
  );
}
