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
    <div className="group relative rounded-xl border border-border bg-background p-4 transition-all duration-150 hover:border-accent/30 hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-xl text-[13px] font-semibold",
            toneFor(project.key),
          )}
        >
          {project.key.slice(0, 2)}
        </span>
        {/* Outside the link: starring must not navigate. */}
        <StarButton projectId={project.id} initialStarred={project.starred} />
      </div>

      <Link
        href={`/projects/${project.id}/issues`}
        className="mt-3 block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 rounded"
      >
        <span className="block truncate text-[15px] font-semibold text-foreground">
          {project.name}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted-foreground">
          {project.description || "No description"}
        </span>
        {/* Covers the card so the whole tile is clickable, while the star stays
            above it in stacking order. */}
        <span className="absolute inset-0" aria-hidden />
      </Link>
    </div>
  );
}
