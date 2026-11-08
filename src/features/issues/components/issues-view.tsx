"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ListTodo, Search, Filter as FilterIcon, Layers, Calendar } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { apiRequest } from "@/shared/lib/api-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState as EmptyStatePrimitive } from "@/shared/components/ui/empty-state";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { CreateIssueDialog } from "./create-issue-dialog";
import {
  IssueTypeIcon,
  PriorityIcon,
  StatusDot,
  statusLabel,
} from "./issue-meta";
import { IssueChips } from "./issue-chips";
import type {
  IssueDetailDto,
  IssueListItemDto,
  IssueListPageDto,
  IssueStatusCounts,
  IssueStatusDto,
} from "@/features/issues/types/issue.types";

type Filter = "ALL" | IssueStatusDto;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "TODO", label: "To Do" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "DONE", label: "Done" },
];

export function IssuesView({
  projectId,
  initialItems,
  initialCursor,
  counts,
  members,
  canWrite,
  canSetEstimate = false,
}: {
  projectId: string;
  initialItems: IssueListItemDto[];
  initialCursor: string | null;
  counts: IssueStatusCounts;
  members: { userId: string; name: string }[];
  canWrite: boolean;
  canSetEstimate?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState<number>(25);

  // Pagination state: cursor stack for previous/next navigation
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState<number>(0);

  const [items, setItems] = useState<IssueListItemDto[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [liveCounts, setLiveCounts] = useState(counts);
  const [loading, setLoading] = useState(false);
  const firstRender = useRef(true);

  const fetchPage = useCallback(
    async (f: Filter, c: string | undefined, take: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (f !== "ALL") params.set("status", f);
        if (c) params.set("cursor", c);
        params.set("take", String(take));

        const page = await apiRequest<IssueListPageDto>(
          `/api/projects/${projectId}/issues?${params.toString()}`
        );
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setLiveCounts(page.counts);
      } catch {
        toast.error("Could not load issues.");
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  // When filter or pageSize changes, reset to page 1
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setCursorStack([undefined]);
    setPageIndex(0);
    void fetchPage(filter, undefined, pageSize);
  }, [filter, pageSize, fetchPage]);

  // Handle Next Page
  const handleNextPage = useCallback(() => {
    if (!nextCursor) return;
    const nextIdx = pageIndex + 1;
    setCursorStack((prev) => {
      const copy = prev.slice(0, nextIdx);
      copy.push(nextCursor);
      return copy;
    });
    setPageIndex(nextIdx);
    void fetchPage(filter, nextCursor, pageSize);
  }, [nextCursor, pageIndex, filter, pageSize, fetchPage]);

  // Handle Prev Page
  const handlePrevPage = useCallback(() => {
    if (pageIndex <= 0) return;
    const prevIdx = pageIndex - 1;
    const prevCursor = cursorStack[prevIdx];
    setPageIndex(prevIdx);
    void fetchPage(filter, prevCursor, pageSize);
  }, [pageIndex, cursorStack, filter, pageSize, fetchPage]);

  const onCreated = useCallback(
    (issue: IssueDetailDto) => {
      setLiveCounts((c) => ({
        ...c,
        ALL: c.ALL + 1,
        [issue.status]: c[issue.status] + 1,
      }));
      if (filter === "ALL" || filter === issue.status) {
        const listItem: IssueListItemDto = {
          id: issue.id,
          projectId: issue.projectId,
          key: issue.key,
          type: issue.type,
          title: issue.title,
          status: issue.status,
          priority: issue.priority,
          assignee: issue.assignee,
          storyPoints: issue.storyPoints,
          updatedAt: issue.updatedAt,
          version: issue.version,
        };
        setItems((prev) => [listItem, ...prev]);
      }
    },
    [filter]
  );

  // Client-side quick filter on current page items for search query
  const displayedItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.key.toLowerCase().includes(q) ||
        (item.assignee && item.assignee.name.toLowerCase().includes(q))
    );
  }, [items, searchQuery]);

  const rangeStart = pageIndex * pageSize + 1;
  const rangeEnd = rangeStart + items.length - 1;
  const totalInFilter = liveCounts[filter];
  const rangeLabel = items.length > 0 ? `${rangeStart}–${rangeEnd}` : "0";

  return (
    <div className="space-y-4">
      {/* Control Bar: Status Tabs + Search + Action */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        {/* Segmented Status Filter Tabs */}
        <div
          className="flex flex-wrap items-center rounded-lg border border-border bg-muted/30 p-0.5 text-xs select-none"
          role="group"
          aria-label="Filter by status"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                filter === f.value
                  ? "bg-surface font-semibold text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <span>{f.label}</span>
              <span className="rounded-full bg-muted px-1.5 py-0.2 text-[10px] font-semibold tabular-nums text-muted-foreground">
                {liveCounts[f.value]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Search */}
          <div className="relative w-full sm:w-52">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter page issues…"
              className="h-8 pl-8 text-xs"
            />
          </div>

          {canWrite && (
            <CreateIssueDialog
              projectId={projectId}
              members={members}
              canSetEstimate={canSetEstimate}
              onCreated={onCreated}
            />
          )}
        </div>
      </div>

      {liveCounts.ALL === 0 ? (
        <EmptyState
          canWrite={canWrite}
          canSetEstimate={canSetEstimate}
          projectId={projectId}
          members={members}
          onCreated={onCreated}
        />
      ) : (
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
          {/* Sticky Table Header */}
          <div className="sticky top-0 z-10 flex h-9 items-center gap-2.5 border-b border-border bg-muted/40 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-xs select-none">
            <span className="w-8 text-center">Type</span>
            <span className="w-20">Key</span>
            <span className="flex-1">Title</span>
            <span className="hidden w-28 sm:block">Status</span>
            <span className="w-8 text-center">Pri</span>
            <span className="hidden w-16 text-right sm:block">Points</span>
            <span className="w-8 text-right">Assignee</span>
          </div>

          {/* Table Rows */}
          <div className="divide-y divide-border/50">
            {loading ? (
              <div className="flex flex-col gap-2 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex h-9 items-center gap-3 animate-pulse">
                    <div className="h-4 w-4 rounded bg-muted" />
                    <div className="h-4 w-16 rounded bg-muted" />
                    <div className="h-4 flex-1 rounded bg-muted" />
                    <div className="h-4 w-20 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : displayedItems.length === 0 ? (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No issues match {filter !== "ALL" ? `“${statusLabel(filter)}”` : "the search query"}.
              </div>
            ) : (
              displayedItems.map((item) => (
                <Link
                  key={item.id}
                  href={`/projects/${projectId}/issues/${item.id}`}
                  className="group flex h-9 items-center gap-2.5 px-3 text-xs transition-colors hover:bg-muted/40"
                >
                  <span className="flex w-8 shrink-0 items-center justify-center text-muted-foreground group-hover:text-foreground">
                    <IssueTypeIcon type={item.type} />
                  </span>

                  <span className="w-20 shrink-0 font-mono text-xs font-semibold text-muted-foreground group-hover:text-foreground">
                    {item.key}
                  </span>

                  <span className="min-w-0 flex-1 truncate font-medium text-foreground group-hover:text-primary transition-colors">
                    {item.title}
                  </span>

                  <span className="hidden w-28 shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
                    <StatusDot status={item.status} />
                    <span className="truncate">{statusLabel(item.status)}</span>
                  </span>

                  <span className="flex w-8 shrink-0 items-center justify-center">
                    <PriorityIcon priority={item.priority} />
                  </span>

                  <span className="hidden w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground sm:block">
                    {item.storyPoints !== null ? `${item.storyPoints} pts` : "—"}
                  </span>

                  <span className="flex w-8 shrink-0 items-center justify-end">
                    {item.assignee ? (
                      <Avatar className="h-5 w-5 ring-1 ring-border">
                        <AvatarImage src={item.assignee.avatarUrl ?? undefined} alt="" />
                        <AvatarFallback className="text-[9px]">
                          {initials(item.assignee.name)}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <span className="h-5 w-5 rounded-full border border-dashed border-border" />
                    )}
                  </span>
                </Link>
              ))
            )}
          </div>

          {/* Integrated First-Class DataPagination */}
          <DataPagination
            mode="cursor"
            hasPrev={pageIndex > 0}
            hasNext={Boolean(nextCursor)}
            onPrev={handlePrevPage}
            onNext={handleNextPage}
            rangeLabel={rangeLabel}
            totalLabel={`${totalInFilter} ${totalInFilter === 1 ? "issue" : "issues"}`}
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </div>
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function EmptyState({
  canWrite,
  canSetEstimate,
  projectId,
  members,
  onCreated,
}: {
  canWrite: boolean;
  canSetEstimate: boolean;
  projectId: string;
  members: { userId: string; name: string }[];
  onCreated: (issue: IssueDetailDto) => void;
}) {
  return (
    <Card flush>
      <div className="p-8">
        <EmptyStatePrimitive
          icon={<ListTodo />}
          title="No issues yet"
          description={
            canWrite
              ? "Create the first issue to start tracking work in this project."
              : "There's nothing here yet. A project member can add the first issue."
          }
          action={
            canWrite && (
              <CreateIssueDialog
                projectId={projectId}
                members={members}
                canSetEstimate={canSetEstimate}
                onCreated={onCreated}
              />
            )
          }
        />
      </div>
    </Card>
  );
}
