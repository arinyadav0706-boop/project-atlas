"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  IssueTypeIcon,
  PriorityIcon,
  StatusDot,
  statusLabel,
} from "@/features/issues/components/issue-meta";
import { cn } from "@/shared/lib/utils";
import type { CrossProjectIssueDto } from "@/features/saved-views/types/saved-view.types";

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
        "group flex h-9 items-center gap-2.5 px-3 transition-colors text-xs",
        selected ? "bg-primary/10" : "bg-surface hover:bg-muted/60"
      )}
    >
      <div className="flex items-center pl-1">
        <Checkbox
          checked={selected}
          aria-label={`Select ${item.key}`}
          onClick={(e) => onToggle(item.id, e.shiftKey)}
        />
      </div>

      <Link
        href={`/projects/${item.projectId}/issues/${item.id}`}
        className="flex min-w-0 flex-1 items-center gap-2.5 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
      >
        <span className="shrink-0 text-muted-foreground group-hover:text-foreground transition-colors">
          <IssueTypeIcon type={item.type} />
        </span>

        <span
          className="shrink-0 truncate rounded-sm bg-primary/10 px-1.5 py-0.5 text-center font-mono text-[10px] font-semibold text-primary"
          title={item.projectName}
        >
          {item.projectKey}
        </span>

        <span className="shrink-0 truncate font-mono text-xs font-medium text-muted-foreground group-hover:text-foreground">
          {item.key}
        </span>

        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground group-hover:text-primary transition-colors">
          {item.parentKey && (
            <span className="mr-1.5 rounded-xs bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
              {item.parentKey}
            </span>
          )}
          {item.title}
          {Boolean(item.blockedBy) && (
            <span
              className="ml-1.5 rounded-sm bg-destructive/10 px-1 py-0.5 text-[10px] font-semibold text-destructive"
              title={`Waiting on ${item.blockedBy} unfinished ${item.blockedBy === 1 ? "issue" : "issues"}`}
            >
              Blocked
            </span>
          )}
        </span>

        {item.dueDate && (
          <span
            className={cn(
              "hidden w-14 shrink-0 text-right text-[11px] font-medium tabular-nums sm:block",
              item.dueOverdue ? "text-destructive font-semibold" : "text-muted-foreground"
            )}
          >
            {formatDue(item.dueDate)}
          </span>
        )}

        <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground sm:flex min-w-[5.5rem]">
          <StatusDot status={item.status} />
          <span>{statusLabel(item.status)}</span>
        </span>

        <span className="shrink-0">
          <PriorityIcon priority={item.priority} />
        </span>

        {item.assignee ? (
          <Avatar className="h-5 w-5 shrink-0 ring-1 ring-border">
            <AvatarImage src={item.assignee.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="text-[9px]">
              {item.assignee.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          <span className="h-5 w-5 shrink-0 rounded-full border border-dashed border-border" />
        )}
      </Link>
    </div>
  );
}
