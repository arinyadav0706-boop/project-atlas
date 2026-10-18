"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ListFilter,
  Save,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PageShell } from "@/shared/components/ui/page-shell";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { DataPagination } from "@/shared/components/ui/data-pagination";
import { BulkActionBar } from "@/features/bulk-edit/components/bulk-action-bar";
import { issueFilterToQuery } from "@/features/issues/lib/issue-filter-query";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import type { WorkflowStatusDto } from "@/features/workflow/types/workflow.types";
import type { BulkEditChanges } from "@/features/bulk-edit/validation/bulk-edit.schemas";
import type { BulkEditResultDto } from "@/features/bulk-edit/types/bulk-edit.types";
import { CustomFieldFilters } from "@/features/custom-fields/components/custom-field-filters";
import type { CustomFieldDefinitionDto } from "@/features/custom-fields/types/custom-field.types";
import { CrossProjectRow } from "@/features/saved-views/components/cross-project-row";
import {
  IssueFilterBar,
  type ProjectOption,
} from "@/features/saved-views/components/issue-filter-bar";
import { SaveViewDialog } from "@/features/saved-views/components/save-view-dialog";
import { ViewRail } from "@/features/saved-views/components/view-rail";
import {
  DEFAULT_SORT,
  type CrossProjectIssueDto,
  type IssueQueryResultDto,
  type SavedViewDto,
  type SavedViewSortDto,
} from "@/features/saved-views/types/saved-view.types";

function buildQuery(
  filter: IssueFilter,
  sort: SavedViewSortDto,
  cursor?: string,
  take?: number
) {
  const q = issueFilterToQuery(filter);
  if (sort !== DEFAULT_SORT) q.set("sort", sort);
  if (cursor) q.set("cursor", cursor);
  if (take) q.set("take", String(take));
  return q;
}

function sameFilter(a: IssueFilter, b: IssueFilter): boolean {
  return issueFilterToQuery(a).toString() === issueFilterToQuery(b).toString();
}

const SORT_OPTIONS: { value: SavedViewSortDto; label: string }[] = [
  { value: "UPDATED_DESC", label: "Recently updated" },
  { value: "CREATED_DESC", label: "Recently created" },
  { value: "PRIORITY_DESC", label: "Highest priority" },
  { value: "DUE_DATE_ASC", label: "Due date (earliest)" },
];

export function IssueWorkspace({
  projects,
  currentUserId,
  initialViews,
  filterableFields,
  initialFilter,
}: {
  projects: ProjectOption[];
  currentUserId: string;
  initialViews: SavedViewDto[];
  filterableFields: CustomFieldDefinitionDto[];
  initialFilter: IssueFilter;
}) {
  const [views, setViews] = useState(initialViews);
  const [activeView, setActiveView] = useState<SavedViewDto | null>(null);
  const [filter, setFilter] = useState<IssueFilter>(initialFilter);
  const [sort, setSort] = useState<SavedViewSortDto>(DEFAULT_SORT);
  const [pageSize, setPageSize] = useState<number>(25);

  // Pagination state: cursor stack for previous/next navigation
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState<number>(0);

  const [result, setResult] = useState<IssueQueryResultDto | null>(null);
  const [items, setItems] = useState<CrossProjectIssueDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveOpen, setSaveOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [applying, setApplying] = useState(false);

  const lastClicked = useRef<string | null>(null);
  const requestId = useRef(0);

  const currentCursor = cursorStack[pageIndex];

  // Fetch a page with specific cursor
  const fetchPage = useCallback(
    async (
      nextFilter: IssueFilter,
      nextSort: SavedViewSortDto,
      cursor: string | undefined,
      take: number
    ) => {
      const id = ++requestId.current;
      setLoading(true);
      try {
        const queryStr = buildQuery(nextFilter, nextSort, cursor, take).toString();
        const data = await apiRequest<IssueQueryResultDto>(`/api/issues?${queryStr}`);
        if (id !== requestId.current) return;
        setResult(data);
        setItems(data.items);
        setSelected(new Set());
      } catch (error) {
        if (id !== requestId.current) return;
        toast.error(error instanceof Error ? error.message : "Couldn't load issues.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    []
  );

  // When filter, sort, or pageSize changes, reset to page 1
  useEffect(() => {
    setCursorStack([undefined]);
    setPageIndex(0);
    void fetchPage(filter, sort, undefined, pageSize);
    const query = buildQuery(filter, sort, undefined, pageSize).toString();
    window.history.replaceState(null, "", query ? `/issues?${query}` : "/issues");
  }, [filter, sort, pageSize, fetchPage]);

  // When navigating via cursor stack (Next/Prev)
  const handleNextPage = useCallback(() => {
    if (!result?.nextCursor) return;
    const nextCursor = result.nextCursor;
    const nextIndex = pageIndex + 1;
    setCursorStack((prev) => {
      const updated = prev.slice(0, nextIndex);
      updated.push(nextCursor);
      return updated;
    });
    setPageIndex(nextIndex);
    void fetchPage(filter, sort, nextCursor, pageSize);
  }, [result?.nextCursor, pageIndex, filter, sort, pageSize, fetchPage]);

  const handlePrevPage = useCallback(() => {
    if (pageIndex <= 0) return;
    const prevIndex = pageIndex - 1;
    const prevCursor = cursorStack[prevIndex];
    setPageIndex(prevIndex);
    void fetchPage(filter, sort, prevCursor, pageSize);
  }, [pageIndex, cursorStack, filter, sort, pageSize, fetchPage]);

  const toggleRow = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const anchor = lastClicked.current;
        if (shiftKey && anchor && anchor !== id) {
          const from = items.findIndex((i) => i.id === anchor);
          const to = items.findIndex((i) => i.id === id);
          if (from !== -1 && to !== -1) {
            const [lo, hi] = from < to ? [from, to] : [to, from];
            const turnOn = !prev.has(id);
            for (const item of items.slice(lo, hi + 1)) {
              if (turnOn) next.add(item.id);
              else next.delete(item.id);
            }
            return next;
          }
        }
        if (!next.delete(id)) next.add(id);
        return next;
      });
      lastClicked.current = id;
    },
    [items]
  );

  const allOnPageSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  const selectedProjectId = useMemo(() => {
    const ids = new Set(
      items.filter((i) => selected.has(i.id)).map((i) => i.projectId)
    );
    return ids.size === 1 ? [...ids][0]! : null;
  }, [items, selected]);

  const [bulkStatuses, setBulkStatuses] = useState<WorkflowStatusDto[]>([]);
  useEffect(() => {
    if (!selectedProjectId) {
      setBulkStatuses([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiRequest<{ statuses: WorkflowStatusDto[] }>(
          `/api/projects/${selectedProjectId}/statuses`
        );
        if (!cancelled) setBulkStatuses(res.statuses);
      } catch {
        if (!cancelled) setBulkStatuses([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  async function applyBulk(changes: BulkEditChanges) {
    setApplying(true);
    try {
      const res = await apiRequest<BulkEditResultDto>("/api/issues/bulk", {
        method: "POST",
        body: { issueIds: [...selected], changes },
      });

      const parts = [`${res.updated} updated`];
      if (res.skipped > 0) parts.push(`${res.skipped} unchanged`);
      if (res.failed > 0) parts.push(`${res.failed} couldn't be changed`);

      if (res.failed > 0) {
        const reasons = res.results
          .filter((r) => r.outcome === "failed")
          .slice(0, 3)
          .map((r) => `${r.key ?? "?"}: ${r.message ?? r.reason}`)
          .join("\n");
        toast.warning(parts.join(" · "), { description: reasons, duration: 10000 });
      } else {
        toast.success(parts.join(" · "));
      }
      if (res.notificationsSuppressed) {
        toast.info("Some assignment notifications were skipped to avoid flooding inboxes.");
      }

      setSelected(new Set());
      await fetchPage(filter, sort, currentCursor, pageSize);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't apply the changes.");
    } finally {
      setApplying(false);
    }
  }

  function selectView(view: SavedViewDto) {
    setActiveView(view);
    setFilter(view.filter);
    setSort(view.sort);
  }

  function clearView() {
    setActiveView(null);
    setFilter({});
    setSort(DEFAULT_SORT);
  }

  async function deleteView(view: SavedViewDto) {
    try {
      await apiRequest(`/api/saved-views/${view.id}`, { method: "DELETE" });
      setViews((prev) => prev.filter((v) => v.id !== view.id));
      if (activeView?.id === view.id) clearView();
      toast.success(`Deleted "${view.name}".`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the view.");
    }
  }

  const rangeStart = pageIndex * pageSize + 1;
  const rangeEnd = rangeStart + items.length - 1;
  const rangeLabel = items.length > 0 ? `${rangeStart}–${rangeEnd}` : "0";

  return (
    <PageShell>
      <PageHeader
        title={activeView ? activeView.name : "All issues"}
        subtitle={
          activeView
            ? "Filtered saved view across your accessible projects."
            : "Search, filter, paginate, and bulk-manage issues across your projects."
        }
        actions={
          <div className="flex items-center gap-2">
            {!activeView && !sameFilter(filter, {}) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSaveOpen(true)}
                className="gap-1.5"
              >
                <Save className="h-3.5 w-3.5 text-primary" />
                <span>Save view</span>
              </Button>
            )}
            {activeView && (
              <Button variant="ghost" size="sm" onClick={clearView}>
                Clear view
              </Button>
            )}
          </div>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Saved Views Rail */}
        <div className="w-full shrink-0 lg:w-56">
          <ViewRail
            views={views}
            activeId={activeView?.id ?? null}
            onSelect={selectView}
            onClear={clearView}
            onDelete={deleteView}
          />
        </div>

        {/* Main Issue Directory */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {/* Filter Bar & Sort Controls */}
          <div className="rounded-xl border border-border bg-surface p-3 shadow-2xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <IssueFilterBar
                  filter={filter}
                  onChange={setFilter}
                  projects={projects}
                  currentUserId={currentUserId}
                />
              </div>

              {/* Sort selector */}
              <div className="flex items-center gap-1.5 shrink-0">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                <Select
                  value={sort}
                  onValueChange={(val) => setSort(val as SavedViewSortDto)}
                >
                  <SelectTrigger className="h-8 w-44 text-xs font-medium">
                    <SelectValue placeholder="Sort by…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value} className="text-xs">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filterableFields.length > 0 && (
              <div className="mt-3 border-t border-border/60 pt-3">
                <CustomFieldFilters
                  fields={filterableFields}
                  predicates={filter.customFields ?? []}
                  onChange={(predicates) =>
                    setFilter((prev) => ({
                      ...prev,
                      customFields: predicates.length > 0 ? predicates : undefined,
                    }))
                  }
                />
              </div>
            )}
          </div>

          {/* Table Container */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xs">
            {/* Table Header Row with Sticky Top */}
            <div className="sticky top-0 z-10 flex h-9 items-center gap-2.5 border-b border-border bg-muted/40 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-xs select-none">
              <div className="flex items-center pl-1">
                <Checkbox
                  checked={allOnPageSelected}
                  aria-label="Select all on this page"
                  onClick={() => {
                    setSelected((prev) => {
                      if (allOnPageSelected) {
                        const next = new Set(prev);
                        for (const item of items) next.delete(item.id);
                        return next;
                      }
                      const next = new Set(prev);
                      for (const item of items) next.add(item.id);
                      return next;
                    });
                  }}
                />
              </div>
              <span className="w-7 text-center">Type</span>
              <span className="w-16">Project</span>
              <span className="w-20">Key</span>
              <span className="flex-1">Title</span>
              <span className="hidden w-16 text-right sm:block">Due</span>
              <span className="hidden w-24 sm:block">Status</span>
              <span className="w-8 text-center">Pri</span>
              <span className="w-8 text-right">Owner</span>
            </div>

            {/* List Body */}
            <div className="divide-y divide-border/50">
              {loading ? (
                <div className="flex flex-col gap-2 p-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex h-9 items-center gap-3">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-4 w-12 rounded" />
                      <Skeleton className="h-4 w-16 rounded" />
                      <Skeleton className="h-4 flex-1 rounded" />
                      <Skeleton className="h-4 w-20 rounded" />
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="py-12">
                  <EmptyState
                    icon={<ListFilter className="h-6 w-6 text-muted-foreground" />}
                    title="No issues match this view"
                    description={
                      result && result.projectsInScope === 0
                        ? "You are not a member of any projects with open issues yet."
                        : "Try loosening your filters, search query, or project selection."
                    }
                    action={
                      !sameFilter(filter, {}) && (
                        <Button variant="outline" size="sm" onClick={() => setFilter({})}>
                          Reset filters
                        </Button>
                      )
                    }
                  />
                </div>
              ) : (
                items.map((item) => (
                  <CrossProjectRow
                    key={item.id}
                    item={item}
                    selected={selected.has(item.id)}
                    onToggle={toggleRow}
                  />
                ))
              )}
            </div>

            {/* Reusable DataPagination Footer */}
            <DataPagination
              mode="cursor"
              hasPrev={pageIndex > 0}
              hasNext={Boolean(result?.nextCursor)}
              onPrev={handlePrevPage}
              onNext={handleNextPage}
              rangeLabel={rangeLabel}
              totalLabel={
                result
                  ? `${result.items.length >= pageSize ? "more" : items.length} across ${result.projectsInScope} ${
                      result.projectsInScope === 1 ? "project" : "projects"
                    }`
                  : undefined
              }
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[10, 25, 50, 100]}
            />
          </div>
        </div>
      </div>

      {/* Bulk Action Bar */}
      <BulkActionBar
        count={selected.size}
        currentUserId={currentUserId}
        statuses={bulkStatuses}
        applying={applying}
        onApply={applyBulk}
        onClear={() => setSelected(new Set())}
      />

      {/* Save View Modal */}
      <SaveViewDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        filter={filter}
        sort={sort}
        existing={activeView}
        onSaved={(created) => {
          setViews((prev) => [...prev, created]);
          setActiveView(created);
        }}
      />
    </PageShell>
  );
}
