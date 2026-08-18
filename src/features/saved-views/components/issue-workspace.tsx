"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ListFilter, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PageShell } from "@/shared/components/ui/page-shell";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { issueFilterToQuery } from "@/features/issues/lib/issue-filter-query";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
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

// The cross-project issue list and its saved views (22_saved_views.md §5).
//
// The filter is mirrored into the URL on every change, so any state is
// shareable as a link without saving anything. Saving is for the queries worth
// naming — which is the distinction Jira blurs by making every filter a stored
// object.

function buildQuery(filter: IssueFilter, sort: SavedViewSortDto, cursor?: string) {
  const q = issueFilterToQuery(filter);
  if (sort !== DEFAULT_SORT) q.set("sort", sort);
  if (cursor) q.set("cursor", cursor);
  return q;
}

/** Same filter, ignoring key order — decides whether "Save" is offered. */
function sameFilter(a: IssueFilter, b: IssueFilter): boolean {
  return issueFilterToQuery(a).toString() === issueFilterToQuery(b).toString();
}

export function IssueWorkspace({
  projects,
  currentUserId,
  initialViews,
  initialFilter,
}: {
  projects: ProjectOption[];
  currentUserId: string;
  initialViews: SavedViewDto[];
  /** Parsed from the URL server-side, so a shared link opens filtered. */
  initialFilter: IssueFilter;
}) {
  const [views, setViews] = useState(initialViews);
  const [activeView, setActiveView] = useState<SavedViewDto | null>(null);
  const [filter, setFilter] = useState<IssueFilter>(initialFilter);
  const [sort, setSort] = useState<SavedViewSortDto>(DEFAULT_SORT);

  const [result, setResult] = useState<IssueQueryResultDto | null>(null);
  const [items, setItems] = useState<CrossProjectIssueDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);

  // Guards against a slow first request landing after a faster later one and
  // overwriting it — the classic filter-as-you-type race.
  const requestId = useRef(0);

  const run = useCallback(async (nextFilter: IssueFilter, nextSort: SavedViewSortDto) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const data = await apiRequest<IssueQueryResultDto>(
        `/api/issues?${buildQuery(nextFilter, nextSort).toString()}`,
      );
      if (id !== requestId.current) return;
      setResult(data);
      setItems(data.items);
    } catch (error) {
      if (id !== requestId.current) return;
      toast.error(error instanceof Error ? error.message : "Couldn't load issues.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Re-query whenever the question changes, and keep the URL in step so the
  // current list is always copy-pasteable. `replaceState` rather than a router
  // push: typing in the search box should not add a history entry per keystroke.
  useEffect(() => {
    void run(filter, sort);
    const query = buildQuery(filter, sort).toString();
    window.history.replaceState(null, "", query ? `/issues?${query}` : "/issues");
  }, [filter, sort, run]);

  const loadMore = useCallback(async () => {
    if (!result?.nextCursor) return;
    setLoadingMore(true);
    try {
      const data = await apiRequest<IssueQueryResultDto>(
        `/api/issues?${buildQuery(filter, sort, result.nextCursor).toString()}`,
      );
      setResult(data);
      setItems((prev) => [...prev, ...data.items]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [filter, sort, result]);

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

  // Offered when the filter has drifted from the loaded view, or when nothing
  // is loaded and the filter actually says something.
  const dirty = activeView
    ? !sameFilter(activeView.filter, filter) || activeView.sort !== sort
    : buildQuery(filter, sort).toString().length > 0;

  return (
    <PageShell width="wide">
      <PageHeader
        icon={<ListFilter />}
        title="Issues"
        subtitle="Every project you can see, in one list."
        actions={
          dirty && (
            <Button size="sm" onClick={() => setSaveOpen(true)}>
              <Save className="h-3.5 w-3.5" />
              Save view
            </Button>
          )
        }
        className="mb-5"
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[15rem_1fr]">
        <ViewRail
          views={views}
          activeId={activeView?.id ?? null}
          onSelect={selectView}
          onClear={clearView}
          onDelete={deleteView}
        />

        <div className="min-w-0 space-y-4">
          <IssueFilterBar
            filter={filter}
            projects={projects}
            currentUserId={currentUserId}
            onChange={(next) => setFilter(next)}
          />

          {activeView?.filterCorrupt && (
            <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/[0.07] px-4 py-3">
              <TriangleAlert className="mt-px h-4 w-4 shrink-0 text-warning" aria-hidden />
              <p className="text-[13px] leading-relaxed text-foreground">
                <span className="font-medium">This view&apos;s saved filter couldn&apos;t be read</span>
                , so it is showing everything. Set the filter you want and save the
                view again to repair it.
              </p>
            </div>
          )}

          {loading ? (
            <Card className="overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-11 border-b border-border last:border-b-0" />
              ))}
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ListFilter />}
                title={
                  result?.projectsInScope === 0
                    ? "No projects in scope"
                    : "Nothing matches this filter"
                }
                // BR-3: "zero results" and "you are in none of these projects"
                // are different answers, and conflating them makes a shared
                // view look broken to the person who cannot see its projects.
                description={
                  result?.projectsInScope === 0
                    ? "You're not a member of any project this view covers. Ask a project lead to add you."
                    : "Try widening the filter, or clear it to see everything."
                }
              />
            </Card>
          ) : (
            <>
              <Card className="overflow-hidden">
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <li key={item.id}>
                      <CrossProjectRow item={item} />
                    </li>
                  ))}
                </ul>
              </Card>

              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {items.length} shown across {result?.projectsInScope ?? 0}{" "}
                  {result?.projectsInScope === 1 ? "project" : "projects"}
                </p>
                {result?.nextCursor && (
                  <Button variant="outline" size="sm" onClick={loadMore} loading={loadingMore}>
                    Load more
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <SaveViewDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        filter={filter}
        sort={sort}
        existing={activeView}
        onSaved={(view, replaced) => {
          setViews((prev) =>
            replaced ? prev.map((v) => (v.id === view.id ? view : v)) : [...prev, view],
          );
          setActiveView(view);
        }}
      />
    </PageShell>
  );
}
