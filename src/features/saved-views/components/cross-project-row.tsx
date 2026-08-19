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

// A result row for the cross-project list.
//
// The one thing it carries that a project-scoped row does not is the project
// key. Without it two issues called "Fix login" are indistinguishable, which is
// the whole hazard of pulling rows out of their project.
//
// Overdue comes from the DTO, decided server-side against one request clock —
// reading the clock here would be impure and could make two rows disagree.
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
    // The checkbox sits OUTSIDE the link. Nesting an interactive control inside
    // an anchor means every click on it also navigates, and the row is the
    // whole point of the link.
    <div
      className={cn(
        "flex items-center gap-3 transition-colors",
        selected ? "bg-accent/[0.06]" : "bg-background hover:bg-muted/60",
      )}
    >
      <span className="pl-4">
        <Checkbox
          checked={selected}
          aria-label={`Select ${item.key}`}
          onClick={(e) => onToggle(item.id, e.shiftKey)}
        />
      </span>

      <Link
        href={`/projects/${item.projectId}/issues/${item.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <IssueTypeIcon type={item.type} />

        <span
          className="w-14 shrink-0 truncate rounded bg-muted px-1.5 py-0.5 text-center font-mono text-[10px] font-medium text-muted-foreground"
          title={item.projectName}
        >
          {item.projectKey}
        </span>

        <span className="w-20 shrink-0 truncate font-mono text-xs text-muted-foreground">
          {item.key}
        </span>

        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
          {/* A subtask's parent, inline before the title (ADR-0045 §6). This
              list mixes the two levels, and "Write the tests" on its own tells
              a reader nothing about which work it belongs to. */}
          {item.parentKey && (
            <span className="mr-1.5 rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
              {item.parentKey}
            </span>
          )}
          {item.title}
        </span>

        {item.dueDate && (
          <span
            className={cn(
              "hidden w-14 shrink-0 text-right text-xs font-medium tabular-nums sm:block",
              item.dueOverdue ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {formatDue(item.dueDate)}
          </span>
        )}

        <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <StatusDot status={item.status} />
          {statusLabel(item.status)}
        </span>

        <PriorityIcon priority={item.priority} />

        {item.assignee ? (
          <Avatar className="h-6 w-6 shrink-0">
            <AvatarImage src={item.assignee.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="text-[10px]">
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
