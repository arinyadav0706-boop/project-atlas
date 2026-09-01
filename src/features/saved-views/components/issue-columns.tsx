"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import {
  IssueTypeIcon,
  PriorityIcon,
  StatusDot,
  statusLabel,
} from "@/features/issues/components/issue-meta";
import { cn } from "@/shared/lib/utils";
import type { Column } from "@/shared/components/data/data-table";
import type { CrossProjectIssueDto } from "@/features/saved-views/types/saved-view.types";
import type { SavedViewSortDto } from "@/features/saved-views/types/saved-view.types";

// Column definitions for the cross-project issue table (04_Modernization_Audit.md §H).
//
// Split out of the workspace so the workspace file stays about STATE and this
// one stays about PRESENTATION. It is also the shape a table library would
// consume unchanged, which is what makes deferring TanStack safe
// (05_Dependency_Review.md §3).
//
// Every cell here renders the same data the old `CrossProjectRow` rendered.
// Nothing was added, nothing dropped — the difference is that the row is now
// aligned columns instead of a flex line, which is the whole point of a dense
// table.

function formatDue(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatUpdated(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The sort tokens the API already accepts, keyed by column.
 *
 * The list is deliberately partial: only columns the backend can actually sort
 * get a `sortKey`, so a header never offers an order the server will ignore.
 */
export const SORT_BY_COLUMN: Record<string, { asc: SavedViewSortDto; desc: SavedViewSortDto }> = {
  key: { asc: "KEY_ASC", desc: "KEY_ASC" },
  priority: { asc: "PRIORITY_ASC", desc: "PRIORITY_DESC" },
  due: { asc: "DUE_DATE_ASC", desc: "DUE_DATE_DESC" },
  updated: { asc: "UPDATED_ASC", desc: "UPDATED_DESC" },
};

export function issueColumns(): Column<CrossProjectIssueDto>[] {
  return [
    {
      id: "key",
      header: "Key",
      width: "132px",
      sortKey: "key",
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-2">
          <IssueTypeIcon type={row.type} className="size-3.5 shrink-0" />
          {/* The issue key ALREADY begins with the project key, so the separate
              chip the old row carried ("DEMO · DEMO-1") said it twice and
              truncated both. The project's full name — the part the key does
              not tell you — moves to the tooltip. */}
          <span
            className="truncate font-mono text-meta text-muted-foreground"
            title={row.projectName}
          >
            {row.key}
          </span>
        </span>
      ),
    },
    {
      id: "title",
      header: "Title",
      // The only elastic column: everything else is fixed so titles get the
      // slack instead of being truncated at a width nobody chose.
      width: "minmax(0, 1fr)",
      cell: (row) => (
        <Link
          href={`/projects/${row.projectId}/issues/${row.id}`}
          // The row is clickable; this keeps the title a real link so
          // middle-click and "open in new tab" still work.
          onClick={(event) => event.stopPropagation()}
          className="truncate text-body text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {row.title}
        </Link>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: "132px",
      hideBelow: "sm",
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <StatusDot status={row.status} />
          <span className="truncate text-meta text-muted-foreground">
            {row.workflowStatus?.name ?? statusLabel(row.status)}
          </span>
        </span>
      ),
    },
    {
      id: "priority",
      header: "Priority",
      width: "84px",
      align: "center",
      sortKey: "priority",
      hideBelow: "md",
      cell: (row) => <PriorityIcon priority={row.priority} />,
    },
    {
      id: "assignee",
      header: "Assignee",
      width: "76px",
      align: "center",
      cell: (row) =>
        row.assignee ? (
          <Avatar className="size-6" title={row.assignee.name}>
            <AvatarImage src={row.assignee.avatarUrl ?? undefined} alt="" />
            <AvatarFallback className="text-[10px]">
              {row.assignee.name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        ) : (
          // A dashed ring rather than an empty cell: "nobody" is a state worth
          // seeing when you are scanning for unassigned work.
          <span
            className="size-6 rounded-full border border-dashed border-border"
            title="Unassigned"
          />
        ),
    },
    {
      id: "due",
      header: "Due",
      width: "76px",
      align: "end",
      sortKey: "due",
      hideBelow: "md",
      cell: (row) =>
        row.dueDate ? (
          <span
            className={cn(
              "text-meta tabular-nums",
              // Overdue is decided server-side against one request clock; the
              // component must not re-derive it (issue.types.ts).
              row.dueOverdue ? "font-medium text-destructive" : "text-muted-foreground",
            )}
          >
            {formatDue(row.dueDate)}
          </span>
        ) : null,
    },
    {
      id: "updated",
      header: "Updated",
      width: "76px",
      align: "end",
      sortKey: "updated",
      hideBelow: "lg",
      cell: (row) => (
        <span className="text-meta tabular-nums text-muted-foreground">
          {formatUpdated(row.updatedAt)}
        </span>
      ),
    },
  ];
}
