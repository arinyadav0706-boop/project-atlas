"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Badge } from "@/shared/components/ui/badge";
import {
  IssueTypeIcon,
  PriorityIcon,
  statusLabel,
} from "@/features/issues/components/issue-meta";
import { IssueChips } from "@/features/issues/components/issue-chips";
import type { IssueListItemDto, IssueStatusDto } from "@/features/issues/types/issue.types";

const STATUS_BADGE: Record<
  IssueStatusDto,
  "default" | "primary" | "warning" | "success"
> = {
  TODO: "default",
  IN_PROGRESS: "primary",
  IN_REVIEW: "warning",
  DONE: "success",
};

export function BacklogItem({
  projectId,
  item,
  canWrite,
  overlay = false,
  showEpic = true,
  leading,
  trailing,
}: {
  projectId: string;
  item: IssueListItemDto;
  canWrite: boolean;
  overlay?: boolean;
  showEpic?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const sortable = useSortable({ id: item.id, disabled: !canWrite });
  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };
  const dragProps = canWrite ? { ...sortable.attributes, ...sortable.listeners } : {};

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      {...dragProps}
      className={cn(
        "group flex items-center gap-3 rounded-2xl border border-border/60 bg-surface px-4 py-2.5 text-sm shadow-2xs transition-all duration-150 hover:border-primary/35 hover:bg-muted/30 hover:shadow-xs",
        canWrite && "cursor-grab touch-none active:cursor-grabbing",
        sortable.isDragging && "opacity-40",
        overlay &&
          "cursor-grabbing shadow-pop ring-2 ring-primary/60 bg-surface/95 backdrop-blur-xl"
      )}
    >
      {leading}
      {canWrite && (
        <GripVertical
          aria-hidden
          className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-opacity group-hover:text-muted-foreground"
        />
      )}
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-muted-foreground ring-1 ring-border/50">
        <IssueTypeIcon type={item.type} className="h-3.5 w-3.5" />
      </span>
      <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-primary">
        {item.key}
      </span>
      <Link
        href={`/projects/${projectId}/issues/${item.id}`}
        draggable={false}
        onClick={(e) => sortable.isDragging && e.preventDefault()}
        className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline transition-colors"
      >
        {item.title}
      </Link>
      <IssueChips
        item={{
          epicKey: showEpic ? item.epicKey : undefined,
          labels: item.labels,
          components: item.components,
        }}
        max={3}
        showComponents={false}
        className="hidden shrink-0 flex-nowrap sm:flex"
      />
      <span className="hidden shrink-0 sm:inline-flex">
        <Badge variant={STATUS_BADGE[item.status] ?? "default"} dot>
          {statusLabel(item.status)}
        </Badge>
      </span>
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
      {trailing}
    </div>
  );
}
