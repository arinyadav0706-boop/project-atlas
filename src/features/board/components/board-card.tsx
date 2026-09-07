"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { IssueTypeIcon, PriorityIcon } from "@/features/issues/components/issue-meta";
import { IssueChips } from "@/features/issues/components/issue-chips";
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
        // Named elevation steps, not Tailwind's defaults: `shadow-card` at
        // rest, `shadow-pop` while a card is lifted under the cursor. The
        // drag overlay is the one place in the app that earns the top step.
        "group rounded-control border border-border bg-background px-2.5 py-2 shadow-card transition-shadow",
        // A card lifts on hover rather than tinting: the board is a field of
        // white cards on a grey well, and a tint at this density reads as a
        // selection state rather than as a pointer.
        "hover:shadow-card-hover",
        canWrite && "cursor-grab active:cursor-grabbing",
        sortable.isDragging && "opacity-40",
        overlay && "rotate-1 cursor-grabbing shadow-pop ring-1 ring-accent",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/projects/${projectId}/issues/${item.id}`}
          // Don't let a click that starts a drag also navigate; and kill the
          // browser's native anchor drag so it can't hijack the dnd gesture.
          draggable={false}
          onClick={(e) => sortable.isDragging && e.preventDefault()}
          className="line-clamp-2 text-body font-medium text-foreground hover:text-accent focus-visible:outline-none focus-visible:underline"
        >
          {item.title}
        </Link>
        <PriorityIcon priority={item.priority} className="mt-0.5 shrink-0" />
      </div>

      <IssueChips item={item} className="mt-1.5" />

      <div className="mt-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 font-mono text-meta text-muted-foreground">
          <IssueTypeIcon type={item.type} className="size-3.5" />
          {item.key}
        </span>
        {item.assignee && (
          <Avatar className="size-5" title={item.assignee.name}>
            {item.assignee.avatarUrl && (
              <AvatarImage src={item.assignee.avatarUrl} alt={item.assignee.name} />
            )}
            <AvatarFallback className="text-micro">
              {item.assignee.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
    </div>
  );
}
