import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { IssueTypeIcon } from "@/features/issues/components/issue-meta";
import { cn } from "@/shared/lib/utils";
import type { IssueListItemDto, IssueStatusDto } from "@/features/issues/types/issue.types";

// Cross-project issue row for Home.
//
// A bordered card per row rather than a divided list. The first visual pass
// restyled the containing card and left this untouched, which is why the page
// still read as the old design wearing a new frame — the row is the thing you
// actually look at.
//
// Two lines: key above, title below. The key is reference data and the title is
// the content, so stacking them lets the title take the full width instead of
// being squeezed into whatever a fixed key column leaves behind.

const STATUS_PILL: Record<IssueStatusDto, { label: string; className: string; dot: string }> = {
  TODO: { label: "To Do", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground/60" },
  IN_PROGRESS: { label: "In Progress", className: "bg-accent/10 text-accent", dot: "bg-accent" },
  IN_REVIEW: { label: "In Review", className: "bg-warning/10 text-warning", dot: "bg-warning" },
  DONE: { label: "Done", className: "bg-success/10 text-success", dot: "bg-success" },
};

/**
 * Short, unambiguous, and never the year for a date inside the current one.
 *
 * Overdue is *not* computed here — it comes from the DTO, decided server-side
 * against one request clock. Pure formatting only.
 */
function formatDue(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function StatusPill({ status }: { status: IssueStatusDto }) {
  const pill = STATUS_PILL[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium",
        pill.className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", pill.dot)} />
      {pill.label}
    </span>
  );
}

export function HomeIssueRow({ item }: { item: IssueListItemDto }) {
  const dueText = item.dueDate ? formatDue(item.dueDate) : null;

  return (
    <Link
      href={`/projects/${item.projectId}/issues/${item.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5 transition-all duration-150 hover:border-accent/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted/70">
        <IssueTypeIcon type={item.type} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[11px] leading-tight text-muted-foreground">
          {item.key}
        </span>
        <span className="mt-0.5 block truncate text-[14px] font-medium leading-snug text-foreground">
          {item.title}
        </span>
      </span>

      <StatusPill status={item.status} />

      {item.assignee && (
        <Avatar className="h-6 w-6 shrink-0">
          {item.assignee.avatarUrl && (
            <AvatarImage src={item.assignee.avatarUrl} alt={item.assignee.name} />
          )}
          <AvatarFallback className="text-[10px]">
            {item.assignee.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}

      {/* Fixed width so dates line up down the column even when one is overdue
          and another is not — a ragged right edge is what makes a list of dates
          hard to scan. */}
      <span
        className={cn(
          "hidden w-14 shrink-0 text-right text-xs font-medium tabular-nums sm:block",
          item.dueOverdue ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {dueText ?? ""}
      </span>
    </Link>
  );
}

// Rows are spaced, not divided — each is its own surface.
export function HomeIssueList({ items }: { items: IssueListItemDto[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {items.map((item) => (
        <HomeIssueRow key={item.id} item={item} />
      ))}
    </div>
  );
}
