import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { IssueTypeIcon, StatusDot, statusLabel } from "@/features/issues/components/issue-meta";
import { cn } from "@/shared/lib/utils";
import type { IssueListItemDto, IssueStatusDto } from "@/features/issues/types/issue.types";

// Cross-project issue row for Home.
//
// One line, not two. The V1 row stacked the key above the title inside a
// bordered card, which made every row 52px and a five-item panel 300px tall —
// so two panels side by side pushed the third below the fold on the screen
// people open first. At 14px on one line a row is 32px and the same panel is
// 190px.
//
// It is deliberately NOT `DataTable`: these are five rows in a narrow panel,
// not a scannable grid, and aligned columns at this width would leave a title
// 120px wide. Same tokens, different structure — which is the distinction
// "reuse the primitives" is supposed to allow.

/**
 * Short, unambiguous, and never the year for a date inside the current one.
 *
 * Overdue is *not* computed here — it comes from the DTO, decided server-side
 * against one request clock. Pure formatting only.
 */
function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Status as a dot plus a word — the same vocabulary the issue table uses. */
export function StatusPill({ status }: { status: IssueStatusDto }) {
  return (
    <span className="hidden shrink-0 items-center gap-1.5 text-meta text-muted-foreground sm:inline-flex">
      <StatusDot status={status} />
      {statusLabel(status)}
    </span>
  );
}

export function HomeIssueRow({ item }: { item: IssueListItemDto }) {
  const dueText = item.dueDate ? formatDue(item.dueDate) : null;

  return (
    <Link
      href={`/projects/${item.projectId}/issues/${item.id}`}
      className={cn(
        "flex h-row-compact items-center gap-2.5 rounded-control px-2 transition-colors",
        "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
      )}
    >
      <IssueTypeIcon type={item.type} className="size-3.5 shrink-0" />

      <span className="hidden shrink-0 font-mono text-meta text-muted-foreground md:inline">
        {item.key}
      </span>

      <span className="min-w-0 flex-1 truncate text-body text-foreground">{item.title}</span>

      <StatusPill status={item.status} />

      {item.assignee ? (
        <Avatar className="size-5 shrink-0" title={item.assignee.name}>
          {item.assignee.avatarUrl && (
            <AvatarImage src={item.assignee.avatarUrl} alt="" />
          )}
          <AvatarFallback className="text-micro">
            {item.assignee.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ) : (
        <span className="size-5 shrink-0" aria-hidden />
      )}

      {/* Fixed width so dates line up down the column even when one is overdue
          and another is not — a ragged right edge is what makes a list of dates
          hard to scan. */}
      <span
        className={cn(
          // 56px and nowrap: "Aug 11" at 12px is 44px, and at w-12 it wrapped
          // to two lines inside a 36px row — the date overflowed the row it
          // belonged to and collided with the one below.
          "hidden w-14 shrink-0 whitespace-nowrap text-right text-meta tabular-nums sm:block",
          item.dueOverdue ? "font-medium text-destructive" : "text-muted-foreground",
        )}
      >
        {dueText ?? ""}
      </span>
    </Link>
  );
}

export function HomeIssueList({ items }: { items: IssueListItemDto[] }) {
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <HomeIssueRow key={item.id} item={item} />
      ))}
    </div>
  );
}
