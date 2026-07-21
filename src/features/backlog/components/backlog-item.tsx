"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  IssueTypeIcon,
  PriorityIcon,
  StatusDot,
  statusLabel,
} from "@/features/issues/components/issue-meta";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// A single backlog row. Draggable only when the viewer can write (VIEWER gets a
// static, read-only row — BR-3). The list spans statuses, so each row shows its
// status; a drag reprioritises only (never changes status — ADR-0013).
export function BacklogItem({
  projectId,
  item,
  canWrite,
  overlay = false,
}: {
  projectId: string;
  item: IssueListItemDto;
  canWrite: boolean;
  overlay?: boolean;
}) {
  const sortable = useSortable({ id: item.id, disabled: !canWrite });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  // The WHOLE row is the drag handle when the viewer can write (the grip is a
  // visual affordance only) — grabbing the card, as users expect, starts the
  // drag. A small PointerSensor distance still lets a plain click open the issue.
  const dragProps = canWrite ? { ...sortable.attributes, ...sortable.listeners } : {};

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      {...dragProps}
      className={cn(
        "flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-2.5 shadow-sm",
        canWrite && "cursor-grab touch-none active:cursor-grabbing",
        sortable.isDragging && "opacity-40",
        overlay && "cursor-grabbing shadow-md ring-1 ring-accent",
      )}
    >
      {canWrite && (
        <GripVertical
          aria-hidden
          className="h-4 w-4 shrink-0 text-muted-foreground/50"
        />
      )}
      <IssueTypeIcon type={item.type} className="h-4 w-4 shrink-0" />
      <Link
        href={`/projects/${projectId}/issues/${item.id}`}
        // Kill the browser's native anchor drag (which otherwise hijacks the
        // gesture with a link ghost); don't navigate if a drag just happened.
        draggable={false}
        onClick={(e) => sortable.isDragging && e.preventDefault()}
        className="min-w-0 flex-1 truncate text-sm font-medium text-foreground hover:text-accent focus-visible:outline-none focus-visible:underline"
      >
        {item.title}
      </Link>
      <span className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground sm:inline-flex">
        <StatusDot status={item.status} />
        {statusLabel(item.status)}
      </span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {item.key}
      </span>
      <PriorityIcon priority={item.priority} className="shrink-0" />
      {item.assignee && (
        <Avatar className="h-5 w-5 shrink-0">
          {item.assignee.avatarUrl && (
            <AvatarImage src={item.assignee.avatarUrl} alt={item.assignee.name} />
          )}
          <AvatarFallback className="text-[10px]">
            {item.assignee.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
