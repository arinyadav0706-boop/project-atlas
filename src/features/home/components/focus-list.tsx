import Link from "next/link";
import { cn } from "@/shared/lib/utils";
import { priorityLabel } from "@/features/issues/components/issue-meta";
import type {
  IssueListItemDto,
  IssuePriorityDto,
} from "@/features/issues/types/issue.types";

// The right rail's issue row, from the approved reference: a hollow circle, the
// title on its own line, then "KEY · ● Priority" under it. The rail is narrow,
// so the title gets the full width rather than sharing a line with metadata.
//
// The due date sits on the right because Your focus is ordered by it. Overdue
// arrives on the DTO, decided by the service against one request-time clock —
// reading the clock here would be impure.

const PRIORITY_DOT: Record<IssuePriorityDto, string> = {
  HIGHEST: "bg-rose-600",
  HIGH: "bg-rose-600",
  MEDIUM: "bg-amber-500",
  LOW: "bg-sky-500",
  LOWEST: "bg-slate-400",
};

const PRIORITY_TEXT: Record<IssuePriorityDto, string> = {
  HIGHEST: "text-rose-700",
  HIGH: "text-rose-700",
  MEDIUM: "text-amber-800",
  LOW: "text-sky-700",
  LOWEST: "text-slate-600",
};

export function FocusList({ items }: { items: IssueListItemDto[] }) {
  return (
    <ul className="-mx-2 flex flex-col">
      {items.map((item) => (
        <FocusRow key={item.id} item={item} />
      ))}
    </ul>
  );
}

function FocusRow({ item }: { item: IssueListItemDto }) {
  return (
    <li className="border-t border-border-subtle first:border-t-0">
      <Link
        href={`/projects/${item.projectId}/issues/${item.id}`}
        className="flex items-start gap-2.5 px-4 py-[11px] transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <span
          aria-hidden
          className="mt-0.5 size-4 shrink-0 rounded-full border-[1.5px] border-border-strong"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] font-medium leading-4 text-foreground">
            {item.title}
          </span>
          <span className="mt-1 flex items-center gap-1.5 text-[11px] leading-4 text-muted-foreground">
            <span className="shrink-0">{item.key}</span>
            <span aria-hidden>·</span>
            <span className={cn("flex items-center gap-1", PRIORITY_TEXT[item.priority])}>
              <span
                className={cn("size-1.5 rounded-full", PRIORITY_DOT[item.priority])}
              />
              {priorityLabel(item.priority)}
            </span>
          </span>
        </span>
        {item.dueDate && (
          <span
            className={cn(
              "shrink-0 text-[11px] leading-4 tabular-nums whitespace-nowrap",
              item.dueOverdue ? "font-medium text-rose-700" : "text-muted-foreground",
            )}
          >
            {new Date(item.dueDate).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </span>
        )}
      </Link>
    </li>
  );
}
