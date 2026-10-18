"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Badge } from "@/shared/components/ui/badge";
import {
  IssueTypeIcon,
  PriorityIcon,
  statusLabel,
} from "@/features/issues/components/issue-meta";
import { cn } from "@/shared/lib/utils";
import type { CrossProjectIssueDto } from "@/features/saved-views/types/saved-view.types";
import type { IssueStatusDto } from "@/features/issues/types/issue.types";

const STATUS_BADGE: Record<
  IssueStatusDto,
  "default" | "primary" | "warning" | "success"
> = {
  TODO: "default",
  IN_PROGRESS: "primary",
  IN_REVIEW: "warning",
  DONE: "success",
};

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CrossProjectRow({
  item,
  selected,
  onToggle,
}: {
  item: CrossProjectIssueDto;
  selected: boolean;
  onToggle: (id: string, shiftKey: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "group flex h-13 items-center gap-3.5 px-5 transition-colors text-sm",
        selected ? "bg-primary/8" : "bg-surface hover:bg-muted/45"
      )}
    >
      <div className="flex items-center">
        <Checkbox
          checked={selected}
          aria-label={`Select ${item.key}`}
          onClick={(e) => onToggle(item.id, e.shiftKey)}
        />
      </div>

      <Link
        href={`/projects/${item.projectId}/issues/${item.id}`}
        className="flex min-w-0 flex-1 items-center gap-3.5 py-2 focus-visible:outline-none"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-muted-foreground ring-1 ring-border/50 transition-transform group-hover:scale-105 group-hover:text-foreground">
          <IssueTypeIcon type={item.type} />
        </span>

        <span
          className="w-18 shrink-0 truncate rounded-full bg-violet-500/12 px-2.5 py-0.5 text-center font-mono text-[11px] font-semibold text-violet-600 dark:text-violet-400"
          title={item.projectName}
        >
          {item.projectKey}
        </span>

        <span className="w-22 shrink-0 truncate font-mono text-xs font-semibold text-primary">
          {item.key}
        </span>

        <span className="min-w-0 flex-1 truncate font-semibold text-foreground group-hover:text-primary transition-colors">
          {item.parentKey && (
            <span className="mr-2 rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] font-medium text-muted-foreground">
              {item.parentKey}
            </span>
          )}
          {item.title}
          {Boolean(item.blockedBy) && (
            <Badge
              variant="destructive"
              className="ml-2"
              title={`Waiting on ${item.blockedBy} unfinished ${item.blockedBy === 1 ? "issue" : "issues"}`}
            >
              Blocked
            </Badge>
          )}
        </span>

        {item.dueDate && (
          <span
            className={cn(
              "hidden w-18 shrink-0 text-right text-xs font-medium tabular-nums sm:block",
              item.dueOverdue ? "text-destructive font-semibold" : "text-muted-foreground"
            )}
          >
            {formatDue(item.dueDate)}
          </span>
        )}

        <span className="hidden w-28 shrink-0 sm:flex">
          <Badge variant={STATUS_BADGE[item.status] ?? "default"} dot>
            {statusLabel(item.status)}
          </Badge>
        </span>

        <span className="flex w-8 shrink-0 justify-center">
          <PriorityIcon priority={item.priority} />
        </span>

        {item.assignee ? (
          <Avatar className="h-6 w-6 shrink-0 ring-2 ring-surface">
            <AvatarImage src={item.assignee.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="text-[10px] font-bold bg-primary/15 text-primary">
              {item.assignee.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="h-6 w-6 shrink-0 rounded-full border border-dashed border-border" />
        )}
      </Link>
    </div>
  );
}
