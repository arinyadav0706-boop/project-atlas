"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Users, Search } from "lucide-react";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import { Card, CardHeader } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { usePagination } from "@/shared/hooks/use-pagination";
import {
  SECTION_ORDER,
  STATUS_META,
  hours,
  rowCaption,
  weeksLabel,
} from "@/features/workload/components/status-meta";
import type {
  WorkloadIssueDto,
  WorkloadRowDto,
  WorkloadStatus,
} from "@/features/workload/types/workload.types";

/** Anchor id, used to bring a deep-linked person into view. */
export function personRowId(userId: string): string {
  return `workload-person-${userId}`;
}

export function PeopleSection({
  rows,
  focusUserId,
  hideHeader = false,
}: {
  rows: WorkloadRowDto[];
  focusUserId?: string;
  hideHeader?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | WorkloadStatus>("ALL");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set(focusUserId ? [focusUserId] : []),
  );

  const toggle = useCallback((userId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!focusUserId) return;
    const target = document.getElementById(personRowId(focusUserId));
    if (!target) return;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "center" });
  }, [focusUserId]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase().trim();
      return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
    });
  }, [rows, statusFilter, query]);

  // Integrated pagination
  const {
    paginatedItems,
    paginationProps,
  } = usePagination({
    items: filteredRows,
    initialPageSize: 10,
    itemLabel: "people",
    resetDeps: [query, statusFilter],
  });

  return (
    <Card>
      {!hideHeader && (
        <CardHeader
          icon={<Users />}
          title="All people"
          action={
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {rows.length}
            </span>
          }
        />
      )}

      {/* Search & Band Filters */}
      <div className="flex flex-col gap-3 border-b border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team members…"
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/30 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`rounded-md px-2 py-1 font-medium transition-all ${
              statusFilter === "ALL"
                ? "bg-surface font-semibold text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            All ({rows.length})
          </button>
          {SECTION_ORDER.map((status) => {
            const count = rows.filter((r) => r.status === status).length;
            if (count === 0) return null;
            return (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition-all ${
                  statusFilter === status
                    ? "bg-surface font-semibold text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[status].dot)} />
                <span>{STATUS_META[status].label}</span>
                <span className="text-[10px] text-muted-foreground">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4">
        {filteredRows.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No team members match &ldquo;{query}&rdquo;.
          </div>
        ) : (
          paginatedItems.map((row) => (
            <PersonRow
              key={row.userId}
              row={row}
              open={expanded.has(row.userId)}
              onToggle={() => toggle(row.userId)}
            />
          ))
        )}
      </div>

      <DataPagination {...paginationProps} pageSizeOptions={[5, 10, 20]} />
    </Card>
  );
}

function PersonRow({
  row,
  open,
  onToggle,
}: {
  row: WorkloadRowDto;
  open: boolean;
  onToggle: () => void;
}) {
  const [issues, setIssues] = useState<WorkloadIssueDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requested = useRef(false);

  useEffect(() => {
    if (!open || requested.current) return;
    requested.current = true;

    let cancelled = false;
    apiRequest<WorkloadIssueDto[]>(`/api/workload/users/${row.userId}`)
      .then((data) => {
        if (!cancelled) setIssues(data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Couldn't load their issues.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, row.userId]);

  return (
    <div
      id={personRowId(row.userId)}
      className={cn(
        "scroll-mt-24 rounded-lg border bg-card shadow-2xs transition-colors",
        open ? "border-primary/40" : "border-border",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <Avatar className="h-7 w-7 shrink-0 ring-1 ring-border/50">
          {row.avatarUrl && <AvatarImage src={row.avatarUrl} alt="" />}
          <AvatarFallback className="text-[10px]">
            {row.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
          {row.name}
        </span>

        <span className="flex items-center gap-2 shrink-0">
          <span
            className={cn("h-1.5 w-1.5 rounded-full", STATUS_META[row.status].dot)}
            aria-hidden
          />
          <span className="w-32 text-right">
            <span className="block text-xs font-bold tabular-nums text-foreground">
              {weeksLabel(row)}
            </span>
            <span className="block text-[11px] text-muted-foreground">
              {rowCaption(row)}
            </span>
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2">
          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : !issues ? (
            <p className="text-xs text-muted-foreground">Loading issues…</p>
          ) : issues.length === 0 ? (
            <p className="text-xs text-muted-foreground">No open issues.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {issues.map((issue) => (
                <li key={issue.id} className="flex items-center gap-2.5 py-1.5 text-xs">
                  <Link
                    href={`/projects/${issue.projectId}/issues/${issue.id}`}
                    className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium text-primary hover:underline bg-primary/5"
                  >
                    {issue.key}
                  </Link>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                    {issue.title}
                  </span>
                  <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:inline">
                    {issue.projectKey}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {issue.status.replace("_", " ").toLowerCase()}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                    {issue.estimateMinutes === null
                      ? "no est."
                      : hours(issue.remainingMinutes)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
