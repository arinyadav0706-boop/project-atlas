"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ListFilter,
  Save,
  ArrowUpDown,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { AppFrame } from "@/shared/components/ui/app-frame";
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

  useEffect(() => {
    setCursorStack([undefined]);
    setPageIndex(0);
    void fetchPage(filter, sort, undefined, pageSize);
    const query = buildQuery(filter, sort, undefined, pageSize).toString();
    window.history.replaceState(null, "", query ? `/issues?${query}` : "/issues");
  }, [filter, sort, pageSize, fetchPage]);

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
    <AppFrame className="space-y-6">
      {/* Cross-Project Explorer Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 hero-mesh p-6 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-glow">
              <ListFilter className="h-6 w-6" />
            </span>
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                <Sparkles className="h-3 w-3" />
                {activeView ? "Saved View" : "Cross-Project Explorer"}
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                {activeView ? activeView.name : "All Issues"}
              </h1>
              <p className="text-[13px] text-muted-foreground">
                {activeView
                  ? "Filtered saved view across your accessible projects."
                  : "Search, filter, paginate, and bulk-manage issues across your entire portfolio."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {!activeView && !sameFilter(filter, {}) && (
              <Button
                variant="outline"
                onClick={() => setSaveOpen(true)}
                className="rounded-full bg-surface/90"
              >
                <Save className="h-4 w-4 text-primary" />
                <span>Save view</span>
              </Button>
            )}
            {activeView && (
              <Button variant="outline" onClick={clearView} className="rounded-full">
                Clear view
              </Button>
            )}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Saved Views Dock */}
        <div className="w-full shrink-0 lg:w-64">
          <ViewRail
            views={views}
            activeId={activeView?.id ?? null}
            onSelect={selectView}
            onClear={clearView}
            onDelete={deleteView}
          />
        </div>

        {/* Main Issue Directory */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Filter Bar & Sort Controls */}
          <div className="rounded-3xl border border-border/60 bg-surface p-4 shadow-card">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <IssueFilterBar
                  filter={filter}
                  onChange={setFilter}
                  projects={projects}
                  currentUserId={currentUserId}
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden />
                <Select
                  value={sort}
                  onValueChange={(val) => setSort(val as SavedViewSortDto)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Sort by…" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {filterableFields.length > 0 && (
              <div className="mt-3.5 border-t border-border-subtle/70 pt-3.5">
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
          <div className="flex flex-col overflow-hidden rounded-3xl border border-border/60 bg-surface shadow-card">
            {/* Table Header Row */}
            <div className="sticky top-0 z-10 flex h-11 items-center gap-3.5 border-b border-border/60 bg-surface-sunken/70 px-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-md select-none">
              <div className="flex items-center">
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
              <span className="w-8 text-center">Type</span>
              <span className="w-18">Project</span>
              <span className="w-22">Key</span>
              <span className="flex-1">Title</span>
              <span className="hidden w-18 text-right sm:block">Due</span>
              <span className="hidden w-28 sm:block">Status</span>
              <span className="w-8 text-center">Pri</span>
              <span className="w-8 text-right">Owner</span>
            </div>

            {/* List Body */}
            <div className="divide-y divide-border-subtle/70">
              {loading ? (
                <div className="flex flex-col gap-3 p-5">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex h-11 items-center gap-4">
                      <Skeleton className="h-5 w-5 rounded-md" />
                      <Skeleton className="h-6 w-14 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                      <Skeleton className="h-4 flex-1 rounded-xl" />
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : items.length === 0 ? (
                <div className="py-14">
                  <EmptyState
                    icon={<ListFilter />}
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

      <BulkActionBar
        count={selected.size}
        currentUserId={currentUserId}
        statuses={bulkStatuses}
        applying={applying}
        onApply={applyBulk}
        onClear={() => setSelected(new Set())}
      />

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
    </AppFrame>
  );
}
