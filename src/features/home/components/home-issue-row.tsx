import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { IssueTypeIcon } from "@/features/issues/components/issue-meta";
import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import type { IssueListItemDto, IssueStatusDto } from "@/features/issues/types/issue.types";

const STATUS_VARIANT: Record<IssueStatusDto, { label: string; variant: "default" | "primary" | "warning" | "success" }> = {
  TODO: { label: "To Do", variant: "default" },
  IN_PROGRESS: { label: "In Progress", variant: "primary" },
  IN_REVIEW: { label: "In Review", variant: "warning" },
  DONE: { label: "Done", variant: "success" },
};

function formatDue(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function StatusPill({ status }: { status: IssueStatusDto }) {
  const config = STATUS_VARIANT[status] ?? { label: status, variant: "default" };
  return (
    <Badge variant={config.variant} dot className="shrink-0 text-[10px]">
      {config.label}
    </Badge>
  );
}

export function HomeIssueRow({ item }: { item: IssueListItemDto }) {
  const dueText = item.dueDate ? formatDue(item.dueDate) : null;

  return (
    <Link
      href={`/projects/${item.projectId}/issues/${item.id}`}
      className="group flex items-center gap-3 px-3.5 py-2 transition-colors duration-150 hover:bg-muted/60 focus-visible:outline-none focus-visible:bg-muted/70"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-muted/60 text-muted-foreground group-hover:text-foreground">
        <IssueTypeIcon type={item.type} />
      </span>

      <span className="font-mono text-xs font-semibold text-primary/90 shrink-0">
        {item.key}
      </span>

      <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground group-hover:text-primary transition-colors">
        {item.title}
      </span>

      <StatusPill status={item.status} />

      {item.assignee && (
        <Avatar className="h-5 w-5 shrink-0 ring-1 ring-border">
          {item.assignee.avatarUrl && (
            <AvatarImage src={item.assignee.avatarUrl} alt={item.assignee.name} />
          )}
          <AvatarFallback className="text-[9px]">
            {item.assignee.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      {dueText && (
        <span
          className={cn(
            "hidden w-14 shrink-0 text-right text-[11px] font-medium tabular-nums sm:block",
            item.dueOverdue ? "text-destructive font-semibold" : "text-muted-foreground"
          )}
        >
          {dueText}
        </span>
      )}
    </Link>
  );
}

// Flat divided list container — zero card-in-card nesting
export function HomeIssueList({ items }: { items: IssueListItemDto[] }) {
  return (
    <div className="flex flex-col divide-y divide-border-subtle -mx-4 -mb-3">
      {items.map((item) => (
        <HomeIssueRow key={item.id} item={item} />
      ))}
    </div>
  );
}
