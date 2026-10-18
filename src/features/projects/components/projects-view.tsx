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
  KanbanSquare,
  ListTodo,
  Sparkles,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { ProjectDto } from "@/features/projects/types/project.types";
import { Badge } from "@/shared/components/ui/badge";
import { Card } from "@/shared/components/ui/card";
import { EmptyState as EmptyStatePrimitive } from "@/shared/components/ui/empty-state";
import { AppFrame } from "@/shared/components/ui/app-frame";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import { CreateProjectDialog } from "./create-project-dialog";

const AVATAR_GRADIENTS = [
  "from-blue-500 to-indigo-600 text-white shadow-blue-500/20",
  "from-violet-500 to-purple-600 text-white shadow-violet-500/20",
  "from-emerald-500 to-teal-600 text-white shadow-emerald-500/20",
  "from-amber-500 to-orange-600 text-white shadow-amber-500/20",
  "from-rose-500 to-pink-600 text-white shadow-rose-500/20",
  "from-cyan-500 to-sky-600 text-white shadow-cyan-500/20",
] as const;

function avatarTone(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length]!;
}

export function ProjectsView({ projects }: { projects: ProjectDto[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "ARCHIVED">("ACTIVE");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  const activeCount = useMemo(
    () => projects.filter((p) => p.status !== "ARCHIVED").length,
    [projects]
  );
  const leadCount = useMemo(
    () => projects.filter((p) => p.myRole === "LEAD").length,
    [projects]
  );
  const archivedCount = useMemo(
    () => projects.filter((p) => p.status === "ARCHIVED").length,
    [projects]
  );

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

  const { paginatedItems, paginationProps } = usePagination({
    items: filteredProjects,
    initialPageSize: 12,
    itemLabel: "projects",
    resetDeps: [query, statusFilter],
  });

  return (
    <AppFrame className="space-y-6">
      {/* Portfolio Hero Header */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 hero-mesh p-6 shadow-card md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-glow">
              <FolderKanban className="h-6 w-6" />
            </span>
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                <Sparkles className="h-3 w-3" />
                Portfolio Directory
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                Projects
              </h1>
              <p className="text-[13px] text-muted-foreground">
                Explore, plan, and deliver work across your accessible project workspaces.
              </p>
            </div>
          </div>

          <CreateProjectDialog withHotkey />
        </div>

        {/* Summary Metric Pills */}
        <div className="mt-5 grid grid-cols-3 gap-3 sm:max-w-xl">
          <div className="rounded-2xl border border-border/60 bg-surface/80 px-4 py-3 shadow-2xs backdrop-blur-md">
            <span className="block text-xs font-medium text-muted-foreground">Active</span>
            <span className="mt-0.5 block text-xl font-bold text-foreground tabular-nums">
              {activeCount}
            </span>
          </div>
          <div className="rounded-2xl border border-border/60 bg-surface/80 px-4 py-3 shadow-2xs backdrop-blur-md">
            <span className="block text-xs font-medium text-muted-foreground">Project Lead</span>
            <span className="mt-0.5 block text-xl font-bold text-primary tabular-nums">
              {leadCount}
            </span>
          </div>
          <div className="rounded-2xl border border-border/60 bg-surface/80 px-4 py-3 shadow-2xs backdrop-blur-md">
            <span className="block text-xs font-medium text-muted-foreground">Archived</span>
            <span className="mt-0.5 block text-xl font-bold text-muted-foreground tabular-nums">
              {archivedCount}
            </span>
          </div>
        </div>
      </section>

      {/* Control Bar: Search + Segmented Status Pills + View Mode */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-3.5 shadow-card sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects by name, key, or mission…"
            className="pl-10 rounded-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Pill Tabs */}
          <div className="inline-flex items-center rounded-2xl border border-border/60 bg-surface-sunken/80 p-1">
            {(["ACTIVE", "ALL", "ARCHIVED"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={cn(
                  "rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
                  statusFilter === tab
                    ? "bg-surface text-foreground shadow-xs ring-1 ring-border/50"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab === "ACTIVE" ? "Active" : tab === "ALL" ? "All" : "Archived"}
              </button>
            ))}
          </div>

          {/* View Switcher */}
          <div className="inline-flex items-center rounded-2xl border border-border/60 bg-surface-sunken/80 p-1">
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              className={cn(
                "rounded-xl p-1.5 transition-all",
                viewMode === "grid"
                  ? "bg-surface text-primary shadow-xs ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("table")}
              aria-label="Table view"
              className={cn(
                "rounded-xl p-1.5 transition-all",
                viewMode === "table"
                  ? "bg-surface text-primary shadow-xs ring-1 ring-border/50"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <TableIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {projects.length === 0 ? (
        <EmptyState />
      ) : filteredProjects.length === 0 ? (
        <Card flush>
          <div className="p-12 text-center text-sm text-muted-foreground">
            No projects match &ldquo;{query}&rdquo;.
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setStatusFilter("ALL");
              }}
              className="ml-2 text-primary underline"
            >
              Clear filters
            </Button>
          </div>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedItems.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.02, ease: "easeOut" }}
              >
                <div className="group flex h-full flex-col justify-between rounded-3xl border border-border/60 bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/35 hover:shadow-card-hover">
                  <div>
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <Link
                        href={`/projects/${project.id}/issues`}
                        className="flex items-center gap-3 min-w-0"
                      >
                        <span
                          className={cn(
                            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xs font-bold shadow-md transition-transform group-hover:scale-105",
                            avatarTone(project.key)
                          )}
                        >
                          {project.key.slice(0, 3)}
                        </span>
                        <div className="min-w-0">
                          <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-primary">
                            {project.key}
                          </span>
                        </div>
                      </Link>

                      {project.status === "ARCHIVED" ? (
                        <Badge variant="outline">Archived</Badge>
                      ) : project.myRole ? (
                        <Badge variant={project.myRole === "LEAD" ? "purple" : "default"} dot>
                          {roleLabel(project.myRole)}
                        </Badge>
                      ) : null}
                    </div>

                    <Link
                      href={`/projects/${project.id}/issues`}
                      className="block focus-visible:outline-none"
                    >
                      <h2 className="text-base font-bold tracking-tight text-foreground transition-colors group-hover:text-primary">
                        {project.name}
                      </h2>
                      <p className="mt-1.5 line-clamp-2 min-h-[2.5rem] text-[13px] leading-relaxed text-muted-foreground">
                        {project.description ?? "No description provided for this workspace."}
                      </p>
                    </Link>
                  </div>

                  <div className="mt-5 flex items-center gap-2 border-t border-border-subtle/80 pt-3.5">
                    <Link
                      href={`/projects/${project.id}/issues`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-sunken/80 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <ListTodo className="h-3.5 w-3.5 text-primary" />
                      <span>Issues</span>
                    </Link>
                    <Link
                      href={`/projects/${project.id}/board`}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface-sunken/80 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <KanbanSquare className="h-3.5 w-3.5 text-violet-500" />
                      <span>Board</span>
                    </Link>
                    <Link
                      href={`/projects/${project.id}/backlog`}
                      aria-label={`Open ${project.name}`}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-sunken/80 text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface shadow-card">
            <DataPagination {...paginationProps} pageSizeOptions={[6, 12, 24, 48]} />
          </div>
        </div>
      ) : (
        <div className="flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-surface shadow-card">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-border/60 bg-surface-sunken/70 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-md select-none">
                <tr className="h-11">
                  <th className="px-5">Key</th>
                  <th className="px-5">Project Name</th>
                  <th className="px-5">Description</th>
                  <th className="px-5">Role</th>
                  <th className="px-5 text-right">Status</th>
                  <th className="px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle/70">
                {paginatedItems.map((project) => (
                  <tr
                    key={project.id}
                    className="group h-13 transition-colors hover:bg-muted/45"
                  >
                    <td className="px-5">
                      <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">
                        {project.key}
                      </span>
                    </td>
                    <td className="px-5 font-semibold text-foreground">
                      <Link
                        href={`/projects/${project.id}/issues`}
                        className="hover:text-primary hover:underline"
                      >
                        {project.name}
                      </Link>
                    </td>
                    <td className="max-w-xs truncate px-5 text-[13px] text-muted-foreground">
                      {project.description ?? "—"}
                    </td>
                    <td className="px-5">
                      {project.myRole ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                          <Shield className="h-3.5 w-3.5 text-primary/70" />
                          {roleLabel(project.myRole)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 text-right">
                      <Badge
                        variant={project.status === "ARCHIVED" ? "outline" : "success"}
                        dot={project.status !== "ARCHIVED"}
                      >
                        {project.status === "ARCHIVED" ? "Archived" : "Active"}
                      </Badge>
                    </td>
                    <td className="px-5 text-right">
                      <Link
                        href={`/projects/${project.id}/issues`}
                        className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
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
      <div className="p-10">
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
