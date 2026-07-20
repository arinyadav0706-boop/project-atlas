import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { IssueTypeIcon, PriorityIcon, StatusDot } from "@/features/issues/components/issue-meta";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

// Compact, cross-project issue row for Home. Links via the issue's own
// projectId (Home spans projects). Server-safe, one-click to the issue.
export function HomeIssueRow({ item }: { item: IssueListItemDto }) {
  return (
    <Link
      href={`/projects/${item.projectId}/issues/${item.id}`}
      className="flex items-center gap-3 border-b border-border bg-background px-4 py-2.5 last:border-b-0 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
    >
      <IssueTypeIcon type={item.type} />
      <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
        {item.key}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {item.title}
      </span>
      <StatusDot status={item.status} className="shrink-0" />
      <PriorityIcon priority={item.priority} className="hidden shrink-0 sm:block" />
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
    </Link>
  );
}

// Shared list container so every issue section looks identical.
export function HomeIssueList({ items }: { items: IssueListItemDto[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {items.map((item) => (
        <HomeIssueRow key={item.id} item={item} />
      ))}
    </div>
  );
}
