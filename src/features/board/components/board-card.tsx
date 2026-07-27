"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { IssueTypeIcon, PriorityIcon } from "@/features/issues/components/issue-meta";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// A single board card. Draggable only when the viewer can write (VIEWER gets a
// static, read-only card — BR-5). A PointerSensor distance constraint on the
// board lets a plain click fall through to the issue link instead of dragging.
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
        "group rounded-lg border border-border bg-background p-3 shadow-sm",
        canWrite && "cursor-grab active:cursor-grabbing",
        sortable.isDragging && "opacity-40",
        overlay && "rotate-1 cursor-grabbing shadow-md ring-1 ring-accent",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/projects/${projectId}/issues/${item.id}`}
          // Don't let a click that starts a drag also navigate; and kill the
          // browser's native anchor drag so it can't hijack the dnd gesture.
          draggable={false}
          onClick={(e) => sortable.isDragging && e.preventDefault()}
          className="line-clamp-2 text-sm font-medium text-foreground hover:text-accent focus-visible:outline-none focus-visible:underline"
        >
          {item.title}
        </Link>
        <PriorityIcon priority={item.priority} className="mt-0.5 shrink-0" />
      </div>

      {(item.epicKey || (item.labels?.length ?? 0) > 0 || (item.components?.length ?? 0) > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.epicKey && (
            <span className="inline-flex items-center gap-1 rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              <IssueTypeIcon type="EPIC" className="h-2.5 w-2.5" />
              {item.epicKey}
            </span>
          )}
          {item.components?.map((component) => (
            <span
              key={component.id}
              className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {component.name}
            </span>
          ))}
          {item.labels?.map((label) => (
            <span
              key={label.id}
              className="inline-flex items-center gap-1 rounded-full border border-border px-1.5 py-0.5 text-[10px]"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: label.color }}
              />
              {label.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <IssueTypeIcon type={item.type} className="h-3.5 w-3.5" />
          {item.key}
        </span>
        {item.assignee && (
          <Avatar className="h-5 w-5">
            {item.assignee.avatarUrl && (
              <AvatarImage src={item.assignee.avatarUrl} alt={item.assignee.name} />
            )}
            <AvatarFallback className="text-[10px]">
              {item.assignee.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
