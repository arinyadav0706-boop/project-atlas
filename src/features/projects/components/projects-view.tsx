"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  FolderKanban,
  Search,
  LayoutGrid,
  Table as TableIcon,
  ArrowRight,
  Shield,
  Layers,
} from "lucide-react";
import type { ProjectDto } from "@/features/projects/types/project.types";
import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import { EmptyState as EmptyStatePrimitive } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { AppFrame } from "@/shared/components/ui/app-frame";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import { CreateProjectDialog } from "./create-project-dialog";

export function ProjectsView({ projects }: { projects: ProjectDto[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ACTIVE");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Filtered projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter === "ACTIVE" && p.status === "ARCHIVED") return false;
      if (statusFilter === "ARCHIVED" && p.status !== "ARCHIVED") return false;

      if (!query.trim()) return true;
      const q = query.toLowerCase().trim();
      return (
        p.name.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
      );
    });
  }, [projects, statusFilter, query]);

  // Integrated pagination
  const {
    paginatedItems,
    paginationProps,
  } = usePagination({
    items: filteredProjects,
    initialPageSize: 12,
    itemLabel: "projects",
    resetDeps: [query, statusFilter],
  });

  return (
    <AppFrame className="py-5">
      <PageHeader
        compact
        icon={<FolderKanban />}
        title="Projects"
        subtitle="Explore and navigate work across your accessible projects."
        actions={<CreateProjectDialog withHotkey />}
        className="mb-5"
      />

      {/* Control Bar: Search + Filter Tabs + View Mode */}
      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects by name or key…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
            {(["ACTIVE", "ALL", "ARCHIVED"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  statusFilter === tab
                    ? "bg-surface font-semibold text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab === "ACTIVE" ? "Active" : tab === "ALL" ? "All" : "Archived"}
              </button>
            ))}
          </div>

          {/* View Toggle */}
          <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              className={`rounded-md p-1 transition-all ${
                viewMode === "grid"
                  ? "bg-surface text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              aria-label="Table view"
              className={`rounded-md p-1 transition-all ${
                viewMode === "table"
                  ? "bg-surface text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : filteredProjects.length === 0 ? (
        <Card flush>
          <div className="p-8 text-center text-xs text-muted-foreground">
            No projects match &ldquo;{query}&rdquo;.
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setStatusFilter("ALL");
              }}
              className="ml-2 h-auto p-0 text-xs text-primary underline"
            >
              Clear filters
            </Button>
          </div>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedItems.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: index * 0.02, ease: "easeOut" }}
              >
                <Link
                  href={`/projects/${project.id}/issues`}
                  className="group flex flex-col justify-between rounded-xl border border-border bg-surface p-4 shadow-2xs transition-all duration-150 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div>
                    <div className="mb-2.5 flex items-center justify-between">
                      <Badge variant="primary" className="font-mono text-[10px]">
                        {project.key}
                      </Badge>
                      {project.status === "ARCHIVED" ? (
                        <Badge variant="outline" className="text-[10px]">Archived</Badge>
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
                      {project.description ?? "No description provided."}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1 font-mono">
                      <Layers className="h-3 w-3 text-primary/70" />
                      <span>Workspace</span>
                    </span>
                    <span className="flex items-center gap-1 font-medium text-foreground group-hover:text-primary transition-colors">
                      Open <ArrowRight className="h-3 w-3" />
                    </span>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>

          {/* Reusable DataPagination Footer */}
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <DataPagination {...paginationProps} pageSizeOptions={[6, 12, 24, 48]} />
          </div>
        </div>
      ) : (
        /* High-Density Table View */
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-left text-xs">
              <thead className="sticky top-0 z-10 border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-xs select-none">
                <tr className="h-9">
                  <th className="px-4">Key</th>
                  <th className="px-4">Project Name</th>
                  <th className="px-4">Description</th>
                  <th className="px-4">Role</th>
                  <th className="px-4 text-right">Status</th>
                  <th className="px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {paginatedItems.map((project) => (
                  <tr
                    key={project.id}
                    className="group h-10 transition-colors hover:bg-muted/40"
                  >
                    <td className="px-4 font-mono font-semibold text-primary">
                      {project.key}
                    </td>
                    <td className="px-4 font-medium text-foreground">
                      <Link
                        href={`/projects/${project.id}/issues`}
                        className="hover:text-primary hover:underline"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-4 text-muted-foreground">
                      {project.description ?? "—"}
                    </td>
                    <td className="px-4">
                      {project.myRole ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                          <Shield className="h-3 w-3 text-primary/60" />
                          {roleLabel(project.myRole)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 text-right">
                      <Badge
                        variant={project.status === "ARCHIVED" ? "outline" : "default"}
                        className="text-[10px]"
                      >
                        {project.status === "ARCHIVED" ? "Archived" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-4 text-right">
                      <Link
                        href={`/projects/${project.id}/issues`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        Open <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <DataPagination {...paginationProps} pageSizeOptions={[10, 25, 50]} />
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
      <div className="p-8">
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
