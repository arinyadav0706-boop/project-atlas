"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { IssueTypeIcon, PriorityIcon } from "@/features/issues/components/issue-meta";
import { IssueChips } from "@/features/issues/components/issue-chips";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

export function BoardCard({
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
  const dragProps = canWrite
    ? { ...sortable.attributes, ...sortable.listeners }
    : {};

  return (
    <div
      ref={sortable.setNodeRef}
      style={style}
      {...dragProps}
      className={cn(
        "group relative rounded-lg border border-border/70 bg-card p-3 shadow-2xs transition-all duration-150 select-none",
        canWrite && "cursor-grab active:cursor-grabbing",
        sortable.isDragging && "opacity-30 scale-[0.98]",
        overlay && "rotate-1 cursor-grabbing shadow-pop ring-2 ring-primary/60 bg-background/95 backdrop-blur-md",
        "hover:border-primary/40 hover:shadow-card hover:-translate-y-0.5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/projects/${projectId}/issues/${item.id}`}
          draggable={false}
          onClick={(e) => sortable.isDragging && e.preventDefault()}
          className="line-clamp-2 text-xs font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline transition-colors"
        >
          {item.title}
        </Link>
        <PriorityIcon priority={item.priority} className="mt-0.5 shrink-0" />
      </div>

      <IssueChips item={item} className="mt-2" />

      <div className="mt-2.5 flex items-center justify-between text-xs pt-1.5 border-t border-border/40">
        <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          <IssueTypeIcon type={item.type} className="h-3.5 w-3.5" />
          {item.key}
        </span>
        {item.assignee && (
          <Avatar className="h-5 w-5 ring-1 ring-border/60">
            {item.assignee.avatarUrl && (
              <AvatarImage src={item.assignee.avatarUrl} alt={item.assignee.name} />
            )}
            <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-medium">
              {item.assignee.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
