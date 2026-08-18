"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ListTodo } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { apiRequest } from "@/shared/lib/api-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { EmptyState as EmptyStatePrimitive } from "@/shared/components/ui/empty-state";
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
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [liveCounts, setLiveCounts] = useState(counts);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const firstRender = useRef(true);

  const query = useCallback(
    (f: Filter, c?: string) => {
      const params = new URLSearchParams();
      if (f !== "ALL") params.set("status", f);
      if (c) params.set("cursor", c);
      const qs = params.toString();
      return apiRequest<IssueListPageDto>(
        `/api/projects/${projectId}/issues${qs ? `?${qs}` : ""}`,
      );
    },
    [projectId],
  );

  const load = useCallback(
    async (f: Filter) => {
      setLoading(true);
      try {
        const page = await query(f);
        setItems(page.items);
        setCursor(page.nextCursor);
      } catch {
        toast.error("Could not load issues.");
      } finally {
        setLoading(false);
      }
    },
    [query],
  );

  // Re-sync with fresh server data on navigation — only on the ALL view, since
  // a filtered view is fetched client-side. Counts are filter-independent, so
  // they always track the server.
  useEffect(() => {
    if (filter === "ALL") {
      setItems(initialItems);
      setCursor(initialCursor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItems, initialCursor]);

  useEffect(() => {
    setLiveCounts(counts);
  }, [counts]);

  // Server-driven filtering: refetch the first page when the filter changes.
  // Skip the initial mount — the ALL view is already server-rendered.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await query(filter, cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
    } catch {
      toast.error("Could not load more issues.");
    } finally {
      setLoadingMore(false);
    }
  }

  // Insert a just-created issue in place — no full-page refresh, no second
  // server round-trip. Bump the counts, and prepend it to the list when the
  // current filter would show it (a new issue is always TODO). It lands in
  // exact server order on the next navigation.
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
    [filter],
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        {/* Same segmented control as Workload's By person / By week: white
            card, hairline border, `shadow-card`, `rounded-xl` outer with
            `rounded-[0.6rem]` thumbs. It was `bg-surface` + `shadow-sm`, a
            fourth elevation nobody defined. */}
        <div
          className="flex items-center gap-0.5 rounded-xl border border-border bg-background p-0.5 shadow-card"
          role="group"
          aria-label="Filter by status"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              aria-pressed={filter === f.value}
              className={cn(
                "rounded-[0.6rem] px-2.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                filter === f.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
              {liveCounts[f.value] ? (
                <span
                  className={cn(
                    "ml-1.5 text-xs tabular-nums",
                    filter === f.value
                      ? "text-accent-foreground/70"
                      : "text-muted-foreground",
                  )}
                >
                  {liveCounts[f.value]}
                </span>
              ) : null}
            </button>
          ))}
        </div>
        {canWrite && (
          <CreateIssueDialog
            projectId={projectId}
            members={members}
            withHotkey
            canSetEstimate={canSetEstimate}
            onCreated={onCreated}
          />
        )}
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
        <>
          {/* A `Card`, so the issue table is the same surface as every panel
              on Home and Workload — hairline border, `rounded-2xl`,
              `shadow-card`. It was a bare bordered box with no elevation, which
              on the tinted canvas read as an outline rather than a sheet. */}
          <ul
            className={cn(
              "overflow-hidden rounded-2xl border border-border bg-background shadow-card transition-opacity",
              loading && "opacity-60",
            )}
          >
            {items.map((issue, index) => (
              <motion.li
                key={issue.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.2) }}
                className="border-b border-border last:border-b-0"
              >
                <Link
                  href={`/projects/${projectId}/issues/${issue.id}`}
                  className="flex items-center gap-3 bg-background px-4 py-2.5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  <IssueTypeIcon type={issue.type} />
                  <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">
                    {issue.key}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {issue.title}
                  </span>
                  {/* Epic / label chips (ADR-0018/0026) — the same component the
                      board card and backlog row use, so one issue reads
                      identically on all three. Capped at 3 including the epic
                      badge, with a "+N": this is a dense single-line row, and
                      wrapping would make some rows taller than their neighbours.
                      Components are dropped here — with a 3-chip budget they
                      crowded out the labels, which are what this list filters
                      on. They remain on the board card and the issue detail. */}
                  <IssueChips
                    item={issue}
                    max={3}
                    showComponents={false}
                    className="hidden shrink-0 flex-nowrap md:flex"
                  />
                  <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
                    <StatusDot status={issue.status} />
                    {statusLabel(issue.status)}
                  </span>
                  <PriorityIcon priority={issue.priority} />
                  {issue.assignee ? (
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={issue.assignee.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback className="text-[10px]">
                        {initials(issue.assignee.name)}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <span className="h-6 w-6 rounded-full border border-dashed border-border" />
                  )}
                </Link>
              </motion.li>
            ))}
          </ul>

          {items.length === 0 && !loading && (
            <p className="rounded-2xl border border-border bg-background px-6 py-12 text-center text-sm text-muted-foreground shadow-card">
              No issues in {statusLabel(filter as IssueStatusDto)}.
            </p>
          )}

          {cursor && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={loadMore} loading={loadingMore}>
                Load more
              </Button>
            </div>
          )}
        </>
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
    <Card>
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
    </Card>
  );
}
