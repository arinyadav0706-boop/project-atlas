"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { FolderKanban } from "lucide-react";
import type { ProjectDto } from "@/features/projects/types/project.types";
import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import { EmptyState as EmptyStatePrimitive } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PageShell } from "@/shared/components/ui/page-shell";
import { CreateProjectDialog } from "./create-project-dialog";

// Screen #3 — docs/05_UI/02_Screens_and_Information_Architecture.md.
// Motion per Design Principles §4: short, purposeful entry/hover
// transitions, not decoration.
export function ProjectsView({ projects }: { projects: ProjectDto[] }) {
  return (
    <PageShell>
      <PageHeader
        icon={<FolderKanban />}
        title="Projects"
        subtitle="Everything your teams are working on, in one place."
        actions={<CreateProjectDialog withHotkey />}
        className="mb-6"
      />

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
                href={`/projects/${project.id}/issues`}
                // `shadow-card-hover` rather than Tailwind's `shadow-md`: the
                // elevation steps are named in the design system precisely so a
                // hover does not invent a fourth one.
                className="group block rounded-2xl border border-border bg-background p-5 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
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
    </PageShell>
  );
}

function roleLabel(role: NonNullable<ProjectDto["myRole"]>): string {
  if (role === "LEAD") return "Lead";
  if (role === "MEMBER") return "Member";
  return "Viewer";
}

// On the shared primitive rather than a hand-built dashed panel, so "nothing
// here yet" looks the same on Projects as it does on Workload and Home.
function EmptyState() {
  return (
    <Card>
      <EmptyStatePrimitive
        icon={<FolderKanban />}
        title="No projects yet"
        description="Create your first project to start organizing work into issues, sprints, and boards."
        action={<CreateProjectDialog />}
      />
    </Card>
  );
}
