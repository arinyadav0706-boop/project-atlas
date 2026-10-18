"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ListChecks,
  Inbox,
  CalendarDays,
  Clock,
  FolderKanban,
  ArrowRight,
  Search,
  Sparkles,
  Bell,
  CheckCircle2,
  AlertCircle,
  Layers,
  KanbanSquare,
  ListTodo,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import { IssueTypeIcon, PriorityIcon } from "@/features/issues/components/issue-meta";
import { StarButton } from "@/features/home/components/star-button";
import type { HomeDto } from "@/features/home/types/home.types";
import type { IssueListItemDto, IssueStatusDto } from "@/features/issues/types/issue.types";

type ActiveTab = "my-work" | "attention" | "due-soon" | "continue";

const STATUS_BADGE: Record<
  IssueStatusDto,
  { label: string; variant: "default" | "primary" | "warning" | "success" }
> = {
  TODO: { label: "To Do", variant: "default" },
  IN_PROGRESS: { label: "In Progress", variant: "primary" },
  IN_REVIEW: { label: "In Review", variant: "warning" },
  DONE: { label: "Done", variant: "success" },
};

const PROJECT_GRADIENTS = [
  "from-blue-500 to-indigo-600 text-white shadow-blue-500/20",
  "from-violet-500 to-purple-600 text-white shadow-violet-500/20",
  "from-emerald-500 to-teal-600 text-white shadow-emerald-500/20",
  "from-amber-500 to-orange-600 text-white shadow-amber-500/20",
  "from-rose-500 to-pink-600 text-white shadow-rose-500/20",
  "from-cyan-500 to-sky-600 text-white shadow-cyan-500/20",
] as const;

function projectGradient(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PROJECT_GRADIENTS[hash % PROJECT_GRADIENTS.length]!;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function HomeCommandCenter({
  firstName,
  greetingText,
  data,
}: {
  firstName: string;
  greetingText: string;
  data: HomeDto;
}) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("my-work");
  const [statusFilter, setStatusFilter] = useState<"ALL" | IssueStatusDto>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const allProjects = useMemo(
    () => [...data.starredProjects, ...data.recentProjects],
    [data.starredProjects, data.recentProjects]
  );

  // Filtered My Work items
  const filteredMyWork = useMemo(() => {
    return data.myWork.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.title.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q)
      );
    });
  }, [data.myWork, statusFilter, searchQuery]);

  const myWorkPagination = usePagination({
    items: filteredMyWork,
    initialPageSize: 6,
    itemLabel: "assigned issues",
    resetDeps: [statusFilter, searchQuery],
  });

  // Delivery breakdown stats
  const inProgressCount = data.myWork.filter((i) => i.status === "IN_PROGRESS").length;
  const inReviewCount = data.myWork.filter((i) => i.status === "IN_REVIEW").length;
  const todoCount = data.myWork.filter((i) => i.status === "TODO").length;
  const overdueCount = data.dueSoon.filter((i) => i.dueOverdue).length;

  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }, []);

  return (
    <div className="space-y-6">
      {/* Hero Bento Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 hero-mesh p-6 shadow-card md:p-7">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-surface/80 px-3 py-1 text-xs font-semibold text-primary shadow-2xs backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5" />
              <span>{todayFormatted}</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
              {greetingText}, {firstName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your personal command center across {allProjects.length}{" "}
              {allProjects.length === 1 ? "active project" : "active projects"}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button asChild variant="outline" className="rounded-full bg-surface/90">
              <Link href="/issues">
                <ListTodo className="h-4 w-4 text-indigo-500" />
                <span>Issue Explorer</span>
              </Link>
            </Button>
            <Button asChild className="rounded-full">
              <Link href="/projects">
                <FolderKanban className="h-4 w-4" />
                <span>All Projects</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        </div>

        {/* 4 Interactive Metric Bento Pills */}
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setActiveTab("my-work")}
            className={cn(
              "group flex items-center justify-between rounded-2xl border p-4 text-left transition-all duration-200",
              activeTab === "my-work"
                ? "border-primary/40 bg-surface shadow-card ring-2 ring-primary/15"
                : "border-border/60 bg-surface/75 hover:bg-surface hover:shadow-xs"
            )}
          >
            <div>
              <p className="text-xs font-medium text-muted-foreground">Assigned to me</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {data.myWork.length}
              </p>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-500/12 text-blue-600 dark:text-blue-400 transition-transform group-hover:scale-105">
              <ListChecks className="h-5 w-5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("attention")}
            className={cn(
              "group flex items-center justify-between rounded-2xl border p-4 text-left transition-all duration-200",
              activeTab === "attention"
                ? "border-amber-500/40 bg-surface shadow-card ring-2 ring-amber-500/15"
                : "border-border/60 bg-surface/75 hover:bg-surface hover:shadow-xs"
            )}
          >
            <div>
              <p className="text-xs font-medium text-muted-foreground">Needs attention</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {data.attention.length}
              </p>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-600 dark:text-amber-400 transition-transform group-hover:scale-105">
              <Inbox className="h-5 w-5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("due-soon")}
            className={cn(
              "group flex items-center justify-between rounded-2xl border p-4 text-left transition-all duration-200",
              activeTab === "due-soon"
                ? "border-rose-500/40 bg-surface shadow-card ring-2 ring-rose-500/15"
                : "border-border/60 bg-surface/75 hover:bg-surface hover:shadow-xs"
            )}
          >
            <div>
              <p className="text-xs font-medium text-muted-foreground">Due soon</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
                  {data.dueSoon.length}
                </span>
                {overdueCount > 0 && (
                  <span className="rounded-full bg-rose-500/12 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                    {overdueCount} overdue
                  </span>
                )}
              </div>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/12 text-rose-600 dark:text-rose-400 transition-transform group-hover:scale-105">
              <CalendarDays className="h-5 w-5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("continue")}
            className={cn(
              "group flex items-center justify-between rounded-2xl border p-4 text-left transition-all duration-200",
              activeTab === "continue"
                ? "border-violet-500/40 bg-surface shadow-card ring-2 ring-violet-500/15"
                : "border-border/60 bg-surface/75 hover:bg-surface hover:shadow-xs"
            )}
          >
            <div>
              <p className="text-xs font-medium text-muted-foreground">Continue working</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground tabular-nums">
                {data.continueWorking.length}
              </p>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-500/12 text-violet-600 dark:text-violet-400 transition-transform group-hover:scale-105">
              <Clock className="h-5 w-5" />
            </span>
          </button>
        </div>
      </section>

      {/* Main 12-Column Spatial Bento Grid */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* Left 8 Columns: Interactive Focus Stream */}
        <div className="flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-surface shadow-card lg:col-span-8">
          {/* Stream Header with Segmented Pill Tabs */}
          <div className="flex flex-col gap-3 border-b border-border-subtle/80 bg-surface-sunken/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-border/60 bg-surface-sunken/90 p-1">
              {(
                [
                  { id: "my-work", label: "My Work", icon: ListChecks, count: data.myWork.length },
                  { id: "attention", label: "Attention", icon: Inbox, count: data.attention.length },
                  { id: "due-soon", label: "Due Soon", icon: CalendarDays, count: data.dueSoon.length },
                  { id: "continue", label: "Recent", icon: Clock, count: data.continueWorking.length },
                ] as const
              ).map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-200",
                      active
                        ? "bg-surface text-foreground shadow-xs ring-1 ring-border/50"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <tab.icon className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-muted-foreground")} />
                    <span>{tab.label}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.2 text-[10px] tabular-nums",
                        active
                          ? "bg-primary/12 text-primary font-bold"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeTab === "my-work" && (
              <div className="relative w-full sm:w-56">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  inputSize="sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter my issues…"
                  className="pl-8 rounded-full"
                />
              </div>
            )}
          </div>

          {/* Sub-filter bar for My Work */}
          {activeTab === "my-work" && data.myWork.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle/60 px-5 py-2.5 bg-surface">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { value: "ALL", label: "All assigned" },
                    { value: "IN_PROGRESS", label: "In Progress" },
                    { value: "IN_REVIEW", label: "In Review" },
                    { value: "TODO", label: "To Do" },
                  ] as const
                ).map((pill) => (
                  <button
                    key={pill.value}
                    type="button"
                    onClick={() => setStatusFilter(pill.value)}
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition-all",
                      statusFilter === pill.value
                        ? "bg-primary text-primary-foreground shadow-2xs font-semibold"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
              <Link
                href="/issues"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Open full explorer
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          {/* Active Tab Content */}
          <div className="divide-y divide-border-subtle/70">
            {activeTab === "my-work" && (
              <>
                {filteredMyWork.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<ListChecks />}
                    title={
                      data.myWork.length === 0
                        ? "No open issues assigned to you"
                        : "No assigned issues match your filter"
                    }
                    description="Issues assigned to you across your projects will appear right here."
                  />
                ) : (
                  <>
                    <div className="divide-y divide-border-subtle/60">
                      {myWorkPagination.paginatedItems.map((item) => (
                        <IssueStreamRow key={item.id} item={item} />
                      ))}
                    </div>
                    {filteredMyWork.length > myWorkPagination.paginationProps.pageSize && (
                      <DataPagination
                        {...myWorkPagination.paginationProps}
                        pageSizeOptions={[6, 12, 24]}
                      />
                    )}
                  </>
                )}
              </>
            )}

            {activeTab === "attention" && (
              <>
                {data.attention.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<CheckCircle2 />}
                    title="You're all caught up!"
                    description="Mentions, review requests, and changes on work you own will surface here."
                  />
                ) : (
                  <div className="divide-y divide-border-subtle/60 p-3 space-y-1.5">
                    {data.attention.map((item) => (
                      <Link
                        key={item.id}
                        href={item.href}
                        className="group flex items-center gap-3.5 rounded-2xl border border-transparent px-4 py-3 transition-all hover:border-border/70 hover:bg-muted/40"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400">
                          <Bell className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                            {item.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Updated {formatShortDate(item.occurredAt)}
                          </p>
                        </div>
                        <Badge variant="warning" dot>
                          Updated
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "due-soon" && (
              <>
                {data.dueSoon.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<CalendarDays />}
                    title="Nothing due in the next 7 days"
                    description="Issues with upcoming due dates or overdue milestones will appear here."
                  />
                ) : (
                  <div className="divide-y divide-border-subtle/60">
                    {data.dueSoon.map((item) => (
                      <IssueStreamRow key={item.id} item={item} emphasizeDue />
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === "continue" && (
              <>
                {data.continueWorking.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Clock />}
                    title="No recent issue history"
                    description="Issues you recently viewed, edited, or transitioned will show up here for instant resumption."
                  />
                ) : (
                  <div className="divide-y divide-border-subtle/60">
                    {data.continueWorking.map((item) => (
                      <IssueStreamRow key={item.id} item={item} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right 4 Columns: Delivery Pulse & Projects Launchpad */}
        <div className="space-y-6 lg:col-span-4">
          {/* Personal Delivery Pulse Card */}
          <div className="rounded-3xl border border-border/60 bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                  <Layers className="h-4 w-4" />
                </span>
                <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                  Workload Pulse
                </h2>
              </div>
              <Badge variant="success" dot>
                Live
              </Badge>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              <div className="rounded-2xl bg-surface-sunken/80 p-3 text-center">
                <span className="block text-lg font-bold text-primary tabular-nums">
                  {inProgressCount}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  In Progress
                </span>
              </div>
              <div className="rounded-2xl bg-surface-sunken/80 p-3 text-center">
                <span className="block text-lg font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {inReviewCount}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  In Review
                </span>
              </div>
              <div className="rounded-2xl bg-surface-sunken/80 p-3 text-center">
                <span className="block text-lg font-bold text-foreground tabular-nums">
                  {todoCount}
                </span>
                <span className="text-[11px] font-medium text-muted-foreground">
                  To Do
                </span>
              </div>
            </div>

            {overdueCount > 0 && (
              <div className="mt-3 flex items-center gap-2 rounded-2xl bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
                <span>
                  {overdueCount} assigned {overdueCount === 1 ? "issue is" : "issues are"} past due date.
                </span>
              </div>
            )}
          </div>

          {/* Starred & Recent Projects Launchpad */}
          <div className="rounded-3xl border border-border/60 bg-surface p-5 shadow-card">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-400">
                  <FolderKanban className="h-4 w-4" />
                </span>
                <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
                  Active Workspaces
                </h2>
              </div>
              <Link
                href="/projects"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                All
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {allProjects.length === 0 ? (
              <EmptyState
                compact
                icon={<FolderKanban />}
                title="No projects yet"
                description="Browse or create a project to start planning sprints and issues."
                action={
                  <Button asChild size="sm" className="rounded-full">
                    <Link href="/projects">Browse Projects</Link>
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
                {allProjects.slice(0, 5).map((project) => (
                  <div
                    key={project.id}
                    className="group relative rounded-2xl border border-border/60 bg-surface-sunken/40 p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:bg-surface hover:shadow-card"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/projects/${project.id}/issues`}
                        className="flex items-center gap-3 min-w-0 flex-1"
                      >
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xs font-bold shadow-sm",
                            projectGradient(project.key)
                          )}
                        >
                          {project.key.slice(0, 3)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                              {project.name}
                            </span>
                          </div>
                          <span className="block truncate text-xs text-muted-foreground">
                            {project.description || `Key: ${project.key}`}
                          </span>
                        </div>
                      </Link>
                      <StarButton projectId={project.id} initialStarred={project.starred} />
                    </div>

                    <div className="mt-3 flex items-center gap-2 pt-2.5 border-t border-border-subtle/70">
                      <Link
                        href={`/projects/${project.id}/issues`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted-foreground shadow-2xs ring-1 ring-border/50 transition-colors hover:text-primary"
                      >
                        <ListTodo className="h-3.5 w-3.5" />
                        <span>Issues</span>
                      </Link>
                      <Link
                        href={`/projects/${project.id}/board`}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-surface px-2.5 py-1.5 text-xs font-semibold text-muted-foreground shadow-2xs ring-1 ring-border/50 transition-colors hover:text-primary"
                      >
                        <KanbanSquare className="h-3.5 w-3.5" />
                        <span>Board</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function IssueStreamRow({
  item,
  emphasizeDue = false,
}: {
  item: IssueListItemDto;
  emphasizeDue?: boolean;
}) {
  const statusInfo = STATUS_BADGE[item.status] ?? {
    label: item.status,
    variant: "default" as const,
  };

  return (
    <Link
      href={`/projects/${item.projectId}/issues/${item.id}`}
      className="group flex items-center gap-3.5 px-5 py-3.5 transition-all duration-150 hover:bg-muted/45"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-muted-foreground ring-1 ring-border/50 transition-transform group-hover:scale-105 group-hover:text-foreground">
        <IssueTypeIcon type={item.type} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
            {item.key}
          </span>
          <span className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {item.title}
          </span>
        </div>
      </div>

      {item.dueDate && (
        <span
          className={cn(
            "hidden shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums sm:inline-flex",
            item.dueOverdue
              ? "bg-rose-500/12 text-rose-600 dark:text-rose-400 font-semibold"
              : emphasizeDue
                ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
                : "bg-muted text-muted-foreground"
          )}
        >
          <CalendarDays className="h-3 w-3" />
          {formatShortDate(item.dueDate)}
        </span>
      )}

      <Badge variant={statusInfo.variant} dot className="shrink-0">
        {statusInfo.label}
      </Badge>

      <PriorityIcon priority={item.priority} className="shrink-0" />

      {item.assignee && (
        <Avatar className="h-6 w-6 shrink-0 ring-2 ring-surface">
          {item.assignee.avatarUrl && (
            <AvatarImage src={item.assignee.avatarUrl} alt={item.assignee.name} />
          )}
          <AvatarFallback className="text-[10px] font-bold bg-primary/15 text-primary">
            {item.assignee.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
    </Link>
  );
}
