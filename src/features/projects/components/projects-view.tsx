"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FolderKanban } from "lucide-react";
import type { ProjectDto } from "@/features/projects/types/project.types";
import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import { EmptyState as EmptyStatePrimitive } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { AppFrame } from "@/shared/components/ui/app-frame";
import { CreateProjectDialog } from "./create-project-dialog";

export function ProjectsView({ projects }: { projects: ProjectDto[] }) {
  return (
    <AppFrame className="py-5">
      <PageHeader
        compact
        icon={<FolderKanban />}
        title="Projects"
        subtitle="Everything your teams are working on, in one place."
        actions={<CreateProjectDialog withHotkey />}
        className="mb-5"
      />

      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project, index) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: index * 0.03, ease: "easeOut" }}
            >
              <Link
                href={`/projects/${project.id}/issues`}
                className="group block rounded-lg border border-border bg-surface p-4 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <Badge variant="primary" className="font-mono text-[10px]">
                    {project.key}
                  </Badge>
                  {project.status === "ARCHIVED" ? (
                    <Badge variant="outline">Archived</Badge>
                  ) : project.myRole ? (
                    <Badge variant="default" className="text-[10px]">
                      {roleLabel(project.myRole)}
                    </Badge>
                  ) : null}
                </div>
                <h2 className="text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                  {project.name}
                </h2>
                <p className="mt-1 line-clamp-2 min-h-[2.25rem] text-xs leading-relaxed text-muted-foreground">
                  {project.description ?? "No description yet."}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </AppFrame>
  );
}

function roleLabel(role: NonNullable<ProjectDto["myRole"]>): string {
  if (role === "LEAD") return "Lead";
  if (role === "MEMBER") return "Member";
  return "Viewer";
}

function EmptyState() {
  return (
    <Card flush>
      <div className="p-6">
        <EmptyStatePrimitive
          icon={<FolderKanban />}
          title="No projects yet"
          description="Create your first project to start organizing work into issues, sprints, and boards."
          action={<CreateProjectDialog />}
        />
      </div>
    </Card>
  );
}
