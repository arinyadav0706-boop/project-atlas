"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FolderKanban } from "lucide-react";
import type { ProjectDto } from "@/features/projects/types/project.types";
import { Badge } from "@/shared/components/ui/badge";
import { CreateProjectDialog } from "./create-project-dialog";

// Screen #3 — docs/05_UI/02_Screens_and_Information_Architecture.md.
// Motion per Design Principles §4: short, purposeful entry/hover
// transitions, not decoration.
export function ProjectsView({ projects }: { projects: ProjectDto[] }) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Projects
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything your teams are working on, in one place.
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, index) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.04, ease: "easeOut" }}
            >
              <Link
                href={`/projects/${project.id}/settings`}
                className="group block rounded-xl border border-border bg-background p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
              >
                <div className="mb-3 flex items-center justify-between">
                  <Badge variant="accent">{project.key}</Badge>
                  {project.status === "ARCHIVED" ? (
                    <Badge variant="outline">Archived</Badge>
                  ) : project.myRole ? (
                    <Badge>{roleLabel(project.myRole)}</Badge>
                  ) : null}
                </div>
                <h2 className="text-[15px] font-semibold text-foreground transition-colors group-hover:text-accent">
                  {project.name}
                </h2>
                <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-muted-foreground">
                  {project.description ?? "No description yet."}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function roleLabel(role: NonNullable<ProjectDto["myRole"]>): string {
  if (role === "LEAD") return "Lead";
  if (role === "MEMBER") return "Member";
  return "Viewer";
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
        <FolderKanban className="h-6 w-6 text-accent" strokeWidth={1.8} />
      </div>
      <h2 className="text-[15px] font-semibold text-foreground">No projects yet</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Create your first project to start organizing work into issues,
        sprints, and boards.
      </p>
      <div className="mt-6">
        <CreateProjectDialog />
      </div>
    </motion.div>
  );
}
