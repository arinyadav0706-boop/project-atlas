import Link from "next/link";
import { cn } from "@/shared/lib/utils";
import { PriorityIcon } from "@/features/issues/components/issue-meta";
import type { IssueListItemDto, IssuePriorityDto } from "@/features/issues/types/issue.types";

// "Your focus" gets its own row shape, because this list answers a different
// question from the others: not *what* is it, but *when*.
//
// The date leads as a calendar-style chip so the column scans as a schedule.
// Using the generic row here — with the date tucked away on the right — is what
// made this section look like every other list on the page. Rows without a due
// date (the priority fill, BR-11) keep the chip's width so titles stay aligned.

const PRIORITY_LABEL: Record<IssuePriorityDto, string> = {
  HIGHEST: "Highest",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  LOWEST: "Lowest",
};

const PRIORITY_TEXT: Record<IssuePriorityDto, string> = {
  HIGHEST: "text-destructive",
  HIGH: "text-destructive",
  MEDIUM: "text-warning",
  LOW: "text-success",
  LOWEST: "text-muted-foreground",
};

function DateChip({ iso, overdue }: { iso: string; overdue: boolean }) {
  const date = new Date(iso);
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 flex-col items-center justify-center rounded-control leading-none",
        // Overdue is the one state worth colouring — everything else is just a
        // date, and tinting them all would make none of them stand out.
        overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
      )}
    >
      {/* 11px is the floor, not 9px — a month abbreviation nobody can read is
          not a date, it is decoration. */}
      <span className="text-micro font-semibold uppercase tracking-wide">
        {date.toLocaleDateString(undefined, { month: "short" })}
      </span>
      <span className="text-body font-semibold tabular-nums text-foreground">
        {date.getDate()}
      </span>
    </span>
  );
}

// Overdue arrives on the DTO, decided by the service against one request-time
// clock. Reading the clock here would be impure, and two rows rendered a tick
// apart could disagree about the same instant.
export function FocusList({ items }: { items: IssueListItemDto[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      {items.map((item) => (
        <Link
          key={item.id}
          href={`/projects/${item.projectId}/issues/${item.id}`}
          className="flex items-center gap-2.5 rounded-control px-2 py-1 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {item.dueDate ? (
            <DateChip iso={item.dueDate} overdue={item.dueOverdue ?? false} />
          ) : (
            <span aria-hidden className="size-9 shrink-0" />
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate text-body text-foreground">{item.title}</span>
            <span className="block font-mono text-meta leading-tight text-muted-foreground">
              {item.key}
            </span>
          </span>

          <span
            className={cn(
              "hidden shrink-0 items-center gap-1 text-meta font-medium sm:flex",
              PRIORITY_TEXT[item.priority],
            )}
          >
            {PRIORITY_LABEL[item.priority]}
            <PriorityIcon priority={item.priority} />
          </span>
        </Link>
      ))}
    </div>
  );
}
