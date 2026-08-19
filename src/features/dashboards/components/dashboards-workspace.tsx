"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import {
  Check,
  Globe,
  LayoutDashboard,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { Button } from "@/shared/components/ui/button";
import { Card } from "@/shared/components/ui/card";
import { EmptyState } from "@/shared/components/ui/empty-state";
import { PageHeader } from "@/shared/components/ui/page-header";
import { PageShell } from "@/shared/components/ui/page-shell";
import { Skeleton } from "@/shared/components/ui/skeleton";
import type { CustomFieldDefinitionDto } from "@/features/custom-fields/types/custom-field.types";
import type { ProjectOption } from "@/features/saved-views/components/issue-filter-bar";
import type { SavedViewDto } from "@/features/saved-views/types/saved-view.types";
import { DashboardDialog } from "@/features/dashboards/components/dashboard-dialog";
import { DashboardRail } from "@/features/dashboards/components/dashboard-rail";
import { SortableWidget } from "@/features/dashboards/components/sortable-widget";
import {
  WidgetDialog,
  type WidgetDraft,
} from "@/features/dashboards/components/widget-dialog";
import { MAX_WIDGETS } from "@/features/dashboards/validation/dashboard.schemas";
import type {
  DashboardDto,
  DashboardSummaryDto,
  DashboardWidgetDto,
  WidgetDataDto,
} from "@/features/dashboards/types/dashboard.types";

// Dashboards (25_dashboards.md §5, ADR-0044).
//
// Config and data are two separate requests on purpose: the config is small and
// changes when someone edits it, the data is the expensive part and is fetched
// for EVERY widget in one call. A reorder therefore does not refetch anything —
// widget ids survive a save, so the data already on screen stays correct.

function toPayload(w: DashboardWidgetDto | WidgetDraft) {
  return {
    id: w.id,
    title: w.title,
    type: w.type,
    width: w.width,
    filter: w.filter,
    savedViewId: w.savedViewId,
    breakdownBy: w.breakdownBy,
  };
}

export function DashboardsWorkspace({
  initialDashboards,
  initialDashboard,
  projects,
  currentUserId,
  savedViews,
  filterableFields,
}: {
  initialDashboards: DashboardSummaryDto[];
  /** Resolved server-side from `?d=`, so a link opens on the right one. */
  initialDashboard: DashboardDto | null;
  projects: ProjectOption[];
  currentUserId: string;
  savedViews: SavedViewDto[];
  filterableFields: CustomFieldDefinitionDto[];
}) {
  const [dashboards, setDashboards] = useState(initialDashboards);
  const [dashboard, setDashboard] = useState<DashboardDto | null>(initialDashboard);
  const [data, setData] = useState<Record<string, WidgetDataDto>>({});
  const [loadingData, setLoadingData] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [widgetDialog, setWidgetDialog] = useState<{
    open: boolean;
    widget: DashboardWidgetDto | null;
  }>({ open: false, widget: null });

  // Guards a slow data response for one dashboard landing after a faster one
  // for the dashboard the reader has since switched to.
  const requestId = useRef(0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const loadData = useCallback(async (id: string) => {
    const token = ++requestId.current;
    setLoadingData(true);
    try {
      const rows = await apiRequest<WidgetDataDto[]>(`/api/dashboards/${id}/data`);
      if (token !== requestId.current) return;
      setData(Object.fromEntries(rows.map((r) => [r.widgetId, r])));
    } catch (error) {
      if (token !== requestId.current) return;
      toast.error(error instanceof Error ? error.message : "Couldn't load the cards.");
    } finally {
      if (token === requestId.current) setLoadingData(false);
    }
  }, []);

  const dashboardId = dashboard?.id ?? null;
  const widgetCount = dashboard?.widgets.length ?? 0;

  // Only when the dashboard itself changes. Editing a widget refetches from
  // `persist` instead — keying this on the widget count too would fire a second
  // identical request every time a card was added or removed.
  useEffect(() => {
    if (dashboardId) void loadData(dashboardId);
  }, [dashboardId, loadData]);

  // Keep the URL pointing at what is on screen, so a dashboard is a link.
  useEffect(() => {
    window.history.replaceState(
      null,
      "",
      dashboardId ? `/dashboards?d=${dashboardId}` : "/dashboards",
    );
  }, [dashboardId]);

  async function select(summary: DashboardSummaryDto) {
    if (summary.id === dashboardId) return;
    setEditing(false);
    setData({});
    try {
      setDashboard(await apiRequest<DashboardDto>(`/api/dashboards/${summary.id}`));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't open that dashboard.");
    }
  }

  /**
   * Persist the whole widget set. The array's order IS the display order, so a
   * reorder and an edit are the same call and cannot disagree with each other.
   */
  async function persist(widgets: (DashboardWidgetDto | WidgetDraft)[], refetch: boolean) {
    if (!dashboard) return;
    setSaving(true);
    try {
      const saved = await apiRequest<DashboardDto>(
        `/api/dashboards/${dashboard.id}/widgets`,
        { method: "PUT", body: { widgets: widgets.map(toPayload) } },
      );
      setDashboard(saved);
      setDashboards((prev) =>
        prev.map((d) =>
          d.id === saved.id ? { ...d, widgetCount: saved.widgets.length } : d,
        ),
      );
      if (refetch) await loadData(saved.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the layout.");
      // Re-read rather than guessing what the server kept.
      try {
        setDashboard(await apiRequest<DashboardDto>(`/api/dashboards/${dashboard.id}`));
      } catch {
        /* the toast above is the report; a failed re-read changes nothing. */
      }
    } finally {
      setSaving(false);
    }
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!dashboard || !over || active.id === over.id) return;
    const from = dashboard.widgets.findIndex((w) => w.id === active.id);
    const to = dashboard.widgets.findIndex((w) => w.id === over.id);
    if (from === -1 || to === -1) return;

    // Optimistic: the grid settles immediately. Nothing is refetched, because
    // moving a card does not change what it counts.
    const next = arrayMove(dashboard.widgets, from, to);
    setDashboard({ ...dashboard, widgets: next });
    void persist(next, false);
  }

  function saveWidget(draft: WidgetDraft) {
    if (!dashboard) return;
    const exists = dashboard.widgets.some((w) => w.id === draft.id);
    const next: (DashboardWidgetDto | WidgetDraft)[] = exists
      ? dashboard.widgets.map((w) => (w.id === draft.id ? { ...w, ...draft } : w))
      : [...dashboard.widgets, draft];
    void persist(next, true);
  }

  function removeWidget(id: string) {
    if (!dashboard) return;
    void persist(
      dashboard.widgets.filter((w) => w.id !== id),
      false,
    );
  }

  async function deleteDashboard() {
    if (!dashboard) return;
    if (!window.confirm(`Delete "${dashboard.name}"? This can't be undone from here.`)) {
      return;
    }
    try {
      await apiRequest(`/api/dashboards/${dashboard.id}`, { method: "DELETE" });
      const remaining = dashboards.filter((d) => d.id !== dashboard.id);
      setDashboards(remaining);
      setDashboard(null);
      setEditing(false);
      toast.success(`Deleted "${dashboard.name}".`);
      const first = remaining[0];
      if (first) void select(first);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't delete the dashboard.");
    }
  }

  const canEdit = dashboard?.canEdit ?? false;
  const atWidgetCap = widgetCount >= MAX_WIDGETS;

  return (
    <PageShell width="wide">
      <PageHeader
        icon={<LayoutDashboard />}
        title={dashboard?.name ?? "Dashboards"}
        subtitle={
          dashboard
            ? dashboard.canEdit
              ? "Your view of the numbers you check every day."
              : `Shared by ${dashboard.owner.name}. You see only the projects you belong to.`
            : "Pin the counts, breakdowns and lists you check every day."
        }
        actions={
          dashboard && (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted px-2 py-1 text-[11px] font-medium text-muted-foreground">
                {dashboard.visibility === "SHARED" ? (
                  <>
                    <Globe className="h-3 w-3" /> Shared
                  </>
                ) : (
                  <>
                    <Lock className="h-3 w-3" /> Private
                  </>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void loadData(dashboard.id)}
                loading={loadingData}
                aria-label="Refresh cards"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              {canEdit && (
                <>
                  <Button
                    variant={editing ? "default" : "outline"}
                    size="sm"
                    onClick={() => setEditing((e) => !e)}
                  >
                    {editing ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Done
                      </>
                    ) : (
                      <>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    disabled={atWidgetCap || saving}
                    title={
                      atWidgetCap
                        ? `A dashboard holds at most ${MAX_WIDGETS} cards.`
                        : undefined
                    }
                    onClick={() => setWidgetDialog({ open: true, widget: null })}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add card
                  </Button>
                </>
              )}
            </>
          )
        }
        className="mb-5"
      />

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[15rem_1fr]">
        <DashboardRail
          dashboards={dashboards}
          activeId={dashboardId}
          onSelect={select}
          onCreate={() => {
            setCreating(true);
            setSettingsOpen(true);
          }}
        />

        <div className="min-w-0 space-y-4">
          {!dashboard ? (
            <Card>
              <EmptyState
                icon={<LayoutDashboard />}
                title={
                  dashboards.length === 0 ? "No dashboards yet" : "Choose a dashboard"
                }
                description={
                  dashboards.length === 0
                    ? "A dashboard is a page of saved questions — open bugs, work by assignee, what's due this week."
                    : "Pick one from the list to open it."
                }
                action={
                  dashboards.length === 0 ? (
                    <Button
                      onClick={() => {
                        setCreating(true);
                        setSettingsOpen(true);
                      }}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      New dashboard
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : dashboard.widgets.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Plus />}
                title="No cards yet"
                description={
                  canEdit
                    ? "Add a card to pin a count, a breakdown, or a list of issues."
                    : "The owner hasn't added any cards to this dashboard."
                }
                action={
                  canEdit ? (
                    <Button onClick={() => setWidgetDialog({ open: true, widget: null })}>
                      <Plus className="h-3.5 w-3.5" />
                      Add your first card
                    </Button>
                  ) : undefined
                }
              />
            </Card>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={dashboard.widgets.map((w) => w.id)}
                strategy={rectSortingStrategy}
              >
                {/* Stretched, not `items-start`: cards sharing a row match
                    heights, so the grid reads as rows rather than as a ragged
                    collage. The Card is `h-full` for the same reason. */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  {dashboard.widgets.map((widget) => (
                    <SortableWidget
                      key={widget.id}
                      widget={widget}
                      data={data[widget.id]}
                      editing={editing}
                      onEdit={() => setWidgetDialog({ open: true, widget })}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {editing && dashboard && canEdit && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border px-4 py-3">
              <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">
                Drag a card by its grip to reorder. Changes save as you make them.
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCreating(false);
                  setSettingsOpen(true);
                }}
              >
                Rename or share
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={deleteDashboard}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete dashboard
              </Button>
            </div>
          )}

          {loadingData && dashboard && dashboard.widgets.length > 0 && (
            <Skeleton className="h-1 w-full rounded-full" />
          )}
        </div>
      </div>

      <DashboardDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        dashboard={creating ? null : dashboard}
        onSaved={(saved, created) => {
          setDashboard(saved);
          setDashboards((prev) => {
            const summary: DashboardSummaryDto = {
              id: saved.id,
              name: saved.name,
              visibility: saved.visibility,
              owner: saved.owner,
              canEdit: saved.canEdit,
              widgetCount: saved.widgets.length,
            };
            return created
              ? [...prev, summary].sort((a, b) => a.name.localeCompare(b.name))
              : prev.map((d) => (d.id === saved.id ? summary : d));
          });
          if (created) setEditing(true);
          toast.success(created ? `Created "${saved.name}".` : "Dashboard updated.");
        }}
      />

      <WidgetDialog
        open={widgetDialog.open}
        onOpenChange={(open) => setWidgetDialog((prev) => ({ ...prev, open }))}
        widget={widgetDialog.widget}
        projects={projects}
        currentUserId={currentUserId}
        savedViews={savedViews}
        filterableFields={filterableFields}
        onSave={saveWidget}
        onDelete={
          widgetDialog.widget
            ? () => removeWidget(widgetDialog.widget!.id)
            : undefined
        }
      />
    </PageShell>
  );
}
