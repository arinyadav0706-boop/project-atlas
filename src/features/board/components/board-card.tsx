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
        "group relative rounded-2xl border border-border/65 bg-surface p-4 shadow-card transition-all duration-200 select-none",
        canWrite && "cursor-grab active:cursor-grabbing",
        sortable.isDragging && "opacity-30 scale-[0.98]",
        overlay &&
          "rotate-1 cursor-grabbing shadow-pop ring-2 ring-primary/60 bg-surface/95 backdrop-blur-xl",
        "hover:border-primary/40 hover:shadow-card-hover hover:-translate-y-0.5"
      )}
    >
      <div className="flex items-start justify-between gap-2.5">
        <Link
          href={`/projects/${projectId}/issues/${item.id}`}
          draggable={false}
          onClick={(e) => sortable.isDragging && e.preventDefault()}
          className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-foreground hover:text-primary focus-visible:outline-none focus-visible:underline transition-colors"
        >
          {item.title}
        </Link>
        <PriorityIcon priority={item.priority} className="mt-0.5 shrink-0" />
      </div>

      <IssueChips item={item} className="mt-2.5" />

      <div className="mt-3.5 flex items-center justify-between pt-2.5 border-t border-border-subtle/70">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 py-0.5 font-mono text-[11px] font-semibold text-primary ring-1 ring-border/50">
          <IssueTypeIcon type={item.type} className="h-3.5 w-3.5" />
          {item.key}
        </span>

        <div className="flex items-center gap-2">
          {item.storyPoints !== null && item.storyPoints !== undefined && (
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
              {item.storyPoints}p
            </span>
          )}
          {item.assignee && (
            <Avatar className="h-6 w-6 ring-2 ring-surface">
              {item.assignee.avatarUrl && (
                <AvatarImage src={item.assignee.avatarUrl} alt={item.assignee.name} />
              )}
              <AvatarFallback className="text-[10px] bg-primary/15 text-primary font-bold">
                {item.assignee.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  );
}
