"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ListTodo } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { CreateIssueDialog } from "./create-issue-dialog";
import {
  IssueTypeIcon,
  PriorityIcon,
  StatusDot,
  statusLabel,
} from "./issue-meta";
import type { IssueListItemDto, IssueStatusDto } from "@/features/issues/types/issue.types";

const FILTERS: { value: "ALL" | IssueStatusDto; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "DONE", label: "Done" },
];

export function IssuesView({
  projectId,
  issues,
  members,
  canWrite,
}: {
  projectId: string;
  issues: IssueListItemDto[];
  members: { userId: string; name: string }[];
  canWrite: boolean;
}) {
  const [filter, setFilter] = useState<"ALL" | IssueStatusDto>("ALL");

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: issues.length };
    for (const i of issues) c[i.status] = (c[i.status] ?? 0) + 1;
    return c;
  }, [issues]);

  const visible = useMemo(
    () => (filter === "ALL" ? issues : issues.filter((i) => i.status === filter)),
    [issues, filter],
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors",
                filter === f.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              {counts[f.value] ? (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {counts[f.value]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {canWrite && (
          <CreateIssueDialog projectId={projectId} members={members} withHotkey />
        )}
      </div>

      {issues.length === 0 ? (
        <EmptyState canWrite={canWrite} projectId={projectId} members={members} />
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface px-6 py-12 text-center text-sm text-muted-foreground">
          No issues in {statusLabel(filter as IssueStatusDto)}.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border">
          {visible.map((issue, index) => (
            <motion.li
              key={issue.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.2) }}
              className="border-b border-border last:border-b-0"
            >
              <Link
                href={`/projects/${projectId}/issues/${issue.id}`}
                className="flex items-center gap-3 bg-background px-4 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              >
                <IssueTypeIcon type={issue.type} />
                <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                  {issue.key}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {issue.title}
                </span>
                <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                  <StatusDot status={issue.status} />
                  {statusLabel(issue.status)}
                </span>
                <PriorityIcon priority={issue.priority} />
                {issue.assignee ? (
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={issue.assignee.avatarUrl ?? undefined} alt="" />
                    <AvatarFallback className="text-[10px]">
                      {initials(issue.assignee.name)}
                    </AvatarFallback>
                  </Avatar>
                ) : (
                  <span className="h-6 w-6 rounded-full border border-dashed border-border" />
                )}
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function EmptyState({
  canWrite,
  projectId,
  members,
}: {
  canWrite: boolean;
  projectId: string;
  members: { userId: string; name: string }[];
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex flex-col items-center rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10">
        <ListTodo className="h-6 w-6 text-accent" strokeWidth={1.8} />
      </div>
      <h2 className="text-[15px] font-semibold text-foreground">No issues yet</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {canWrite
          ? "Create the first issue to start tracking work in this project."
          : "There's nothing here yet. A project member can add the first issue."}
      </p>
      {canWrite && (
        <div className="mt-6">
          <CreateIssueDialog projectId={projectId} members={members} />
        </div>
      )}
    </motion.div>
  );
}
