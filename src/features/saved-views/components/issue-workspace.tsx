"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListFilter, Save, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { EmptyState } from "@/shared/components/ui/empty-state";
import {
  AppFrame,
  Toolbar,
  Workspace,
  WorkspaceHeader,
} from "@/shared/components/layout/app-frame";
import { DataTable } from "@/shared/components/data/data-table";
import { issueColumns, SORT_BY_COLUMN } from "@/features/saved-views/components/issue-columns";
import { ViewSwitcher } from "@/features/saved-views/components/view-switcher";
import { issueFilterToQuery } from "@/features/issues/lib/issue-filter-query";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import { BulkActionBar } from "@/features/bulk-edit/components/bulk-action-bar";
import type { WorkflowStatusDto } from "@/features/workflow/types/workflow.types";
import type { BulkEditChanges } from "@/features/bulk-edit/validation/bulk-edit.schemas";
import type { BulkEditResultDto } from "@/features/bulk-edit/types/bulk-edit.types";
import { CustomFieldFilters } from "@/features/custom-fields/components/custom-field-filters";
import type { CustomFieldDefinitionDto } from "@/features/custom-fields/types/custom-field.types";
import {
  IssueFilterBar,
  type ProjectOption,
} from "@/features/saved-views/components/issue-filter-bar";
import { SaveViewDialog } from "@/features/saved-views/components/save-view-dialog";
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
  filterableFields,
  initialFilter,
}: {
  projects: ProjectOption[];
  currentUserId: string;
  initialViews: SavedViewDto[];
  /** Fields at least one project enables — the ones worth offering (ADR-0043). */
  filterableFields: CustomFieldDefinitionDto[];
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
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [applying, setApplying] = useState(false);
  // Anchor for shift-click range selection — the behaviour every list of
  // checkboxes is expected to have and nobody mentions until it is missing.
  const lastClicked = useRef<string | null>(null);

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
      // A new question means a new list; carrying the selection would leave
      // ids checked that are no longer on screen.
      setSelected(new Set());
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
            // The anchor's resulting state drives the range, matching how
            // file managers and every mail client behave.
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
    [items],
  );

  const allOnPageSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  /**
   * Statuses to offer for a bulk status change — only when the selection sits
   * in ONE project.
   *
   * Statuses are per-project (30_workflow BR-1), so a status id means nothing
   * to a selection spanning two of them. Rather than offer options the server
   * would refuse per issue, the control hides — the same reasoning that already
   * keeps the assignee and sprint pickers out of a cross-project selection.
   */
  const selectedProjectId = useMemo(() => {
    const ids = new Set(
      items.filter((i) => selected.has(i.id)).map((i) => i.projectId),
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
          `/api/projects/${selectedProjectId}/statuses`,
        );
        if (!cancelled) setBulkStatuses(res.statuses);
      } catch {
        // A failed lookup hides the control rather than showing a stale list.
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
        // The failures are the point. Naming the first few (and why) is what
        // stops someone repeating the same impossible edit.
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
      await run(filter, sort);
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

  // Offered when the filter has drifted from the loaded view, or when nothing
  // is loaded and the filter actually says something.
  const dirty = activeView
    ? !sameFilter(activeView.filter, filter) || activeView.sort !== sort
    : buildQuery(filter, sort).toString().length > 0;

  // Columns are memoised because `DataTable` compares them per render and a
  // fresh array every keystroke in the search box would rebuild the header.
  const columns = useMemo(() => issueColumns(), []);

  // Column sort ↔ the API's own vocabulary. The table speaks
  // (key, direction); the service speaks `UPDATED_DESC`. Translating here keeps
  // both honest and adds no new sort capability — every token below was already
  // accepted by `/api/issues`.
  const activeSortColumn =
    Object.entries(SORT_BY_COLUMN).find(
      ([, tokens]) => tokens.asc === sort || tokens.desc === sort,
    )?.[0] ?? null;
  const activeSortDirection =
    activeSortColumn && SORT_BY_COLUMN[activeSortColumn]?.desc === sort ? "desc" : "asc";

  return (
    <AppFrame>
      <WorkspaceHeader
        title="Issues"
        // The subtitle used to occupy its own line under a 26px title, costing
        // ~92px of vertical chrome. It is not deleted — it is one hover away.
        description="Every project you can see, in one list."
        actions={
          dirty && (
            <Button size="sm" onClick={() => setSaveOpen(true)}>
              <Save className="size-3.5" />
              Save view
            </Button>
          )
        }
      />

      <Toolbar
        trailing={
          <>
            <span className="whitespace-nowrap text-meta text-muted-foreground">
              {items.length} shown · {result?.projectsInScope ?? 0}{" "}
              {result?.projectsInScope === 1 ? "project" : "projects"}
            </span>
            {result?.nextCursor && (
              <Button variant="outline" size="sm" onClick={loadMore} loading={loadingMore}>
                Load more
              </Button>
            )}
          </>
        }
      >
        {/* Saved views move from a 15rem left rail into the toolbar. Same
            feature, same handlers — but the rail was a second sidebar beside
            the global one, and on a 1920px screen it cost 240px to show a list
            that is usually three items long. */}
        <ViewSwitcher
          views={views}
          activeView={activeView}
          onSelect={selectView}
          onClear={clearView}
          onDelete={deleteView}
        />
        <IssueFilterBar
          layout="row"
          filter={filter}
          projects={projects}
          currentUserId={currentUserId}
          onChange={(next) => setFilter(next)}
        />
        <CustomFieldFilters
          layout="row"
          fields={filterableFields}
          predicates={filter.customFields ?? []}
          onChange={(customFields) =>
            setFilter({
              ...filter,
              customFields: customFields.length ? customFields : undefined,
            })
          }
        />
      </Toolbar>

      {activeView?.filterCorrupt && (
        <div className="flex shrink-0 items-start gap-2 border-b border-warning/30 bg-warning/[0.07] px-4 py-2">
          <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" aria-hidden />
          <p className="text-body text-foreground">
            <span className="font-medium">This view&apos;s saved filter couldn&apos;t be read</span>
            , so it is showing everything. Set the filter you want and save the view again
            to repair it.
          </p>
        </div>
      )}

      {/* Shown only while something is ticked. A permanent "Select all 50 on
          this page" strip cost 32px of every screen to state a fact the header
          checkbox already offers — and the scope caveat only matters once a
          selection exists (ADR-0041 §3). */}
      {selected.size > 0 && (
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border-subtle bg-accent/[0.06] px-4 text-meta text-foreground">
          <span className="font-medium">{selected.size} selected</span>
          <span className="text-muted-foreground">
            on this page ({items.length} loaded)
          </span>
        </div>
      )}

      <Workspace>
        <DataTable
          rows={items}
          columns={columns}
          rowKey={(row) => row.id}
          loading={loading}
          selection={{
            selected: selected as Set<string>,
            // Shift-click range selection is preserved: the table hands back
            // the id, the workspace's own `toggleRow` still owns the anchor.
            onToggle: (id) => toggleRow(id, false),
            onToggleAll: () =>
              setSelected(allOnPageSelected ? new Set() : new Set(items.map((i) => i.id))),
            label: "Select all issues on this page",
            // The KEY, not the row id — what the old row announced, and what a
            // person would say out loud.
            rowLabel: (row) => row.key,
          }}
          sort={{
            key: activeSortColumn,
            direction: activeSortDirection,
            onChange: (key, direction) => {
              const tokens = SORT_BY_COLUMN[key];
              if (tokens) setSort(direction === "asc" ? tokens.asc : tokens.desc);
            },
          }}
          empty={
            <EmptyState
              icon={<ListFilter />}
              title={
                result?.projectsInScope === 0
                  ? "No projects in scope"
                  : "Nothing matches this filter"
              }
              // BR-3: "zero results" and "you are in none of these projects"
              // are different answers, and conflating them makes a shared view
              // look broken to the person who cannot see its projects.
              description={
                result?.projectsInScope === 0
                  ? "You're not a member of any project this view covers. Ask a project lead to add you."
                  : "Try widening the filter, or clear it to see everything."
              }
            />
          }
        />
      </Workspace>

      {selected.size > 0 && (
        <div className="shrink-0 border-t border-border px-4 py-2">
          <BulkActionBar
            count={selected.size}
            currentUserId={currentUserId}
            statuses={bulkStatuses}
            applying={applying}
            onApply={applyBulk}
            onClear={() => setSelected(new Set())}
          />
        </div>
      )}

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
    </AppFrame>
  );
}
