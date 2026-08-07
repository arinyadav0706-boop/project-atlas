"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, ChevronUp, ChevronDown } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { toast } from "sonner";
import { apiRequest } from "@/shared/lib/api-client";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/shared/components/ui/dropdown-menu";
import { BacklogItem } from "@/features/backlog/components/backlog-item";
import { BoardFilterBar } from "@/features/board/components/board-filter-bar";
import { issueFilterToQuery, isIssueFilterActive } from "@/features/issues/lib/issue-filter-query";
import type { IssueFilter } from "@/features/issues/types/issue-filter.types";
import { InlineCreateIssue } from "@/features/backlog/components/inline-create-issue";
import { IssueTypeIcon } from "@/features/issues/components/issue-meta";
import {
  CompleteSprintButton,
  CreateSprintButton,
  DeleteSprintButton,
  EditSprintButton,
  StartSprintButton,
} from "./sprint-controls";
import type { BacklogDto } from "@/features/backlog/types/backlog.types";
import type {
  SprintPanelDto,
  SprintWithProgressDto,
} from "@/features/sprints/types/sprint.types";
import type { IssueListItemDto } from "@/features/issues/types/issue.types";

const BACKLOG_LIST = "backlog";
const SPRINT_PREFIX = "sprint:";
// Backlog epic-group droppable prefix (ADR-0026): when "Group by epic" is on,
// the backlog is split into one droppable per epic + a "No epic" group. Every
// bepic:* list is still the backlog for rank/sprint purposes — it only carries a
// target epicId. `bepic:none` = the No-epic group.
const BEPIC_PREFIX = "bepic:";
const NO_EPIC = "none";
// A list id is the backlog, a backlog epic-group, or a specific sprint.
type ListId = typeof BACKLOG_LIST | `sprint:${string}` | `bepic:${string}`;

function sprintListId(sprintId: string): ListId {
  return `${SPRINT_PREFIX}${sprintId}`;
}
function backlogGroupId(epicId: string | null): ListId {
  return `${BEPIC_PREFIX}${epicId ?? NO_EPIC}`;
}
function isBacklogGroup(listId: string): boolean {
  return listId.startsWith(BEPIC_PREFIX);
}
// Any list that lives in the backlog rank space (the flat backlog or a group).
function isBacklogList(listId: string): boolean {
  return listId === BACKLOG_LIST || isBacklogGroup(listId);
}
// The target epic of a backlog group list (null for the No-epic group).
function epicOfGroup(listId: ListId): string | null {
  const raw = listId.slice(BEPIC_PREFIX.length);
  return raw === NO_EPIC ? null : raw;
}
// The sprint id a list id refers to, or null for any backlog list.
function sprintIdOf(listId: ListId): string | null {
  return isBacklogList(listId) ? null : listId.slice(SPRINT_PREFIX.length);
}

const collisionDetection: CollisionDetection = (args) => {
  const pointer = pointerWithin(args);
  return pointer.length > 0 ? pointer : rectIntersection(args);
};

// The Backlog page's planning view (ADR-0015): every non-completed sprint as its
// own droppable section, stacked over the backlog, all in one DndContext so
// issues drag between any sprint and the backlog. A drag within the backlog uses
// PATCH /rank (scope=backlog); any drag touching a sprint uses
// PATCH /issues/{id}/sprint (set/clear sprintId + rank). VIEWER is read-only.
export function SprintPlanningView({
  projectId,
  initialSprint,
  initialBacklog,
  epics,
  members,
  labels,
  components,
}: {
  projectId: string;
  initialSprint: SprintPanelDto;
  initialBacklog: BacklogDto;
  epics: { id: string; key: string; title: string }[];
  members: { userId: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  components: { id: string; name: string }[];
}) {
  const router = useRouter();
  const canWrite = initialSprint.canWrite && initialBacklog.canWrite;
  const canManage = initialSprint.canManage;
  const completedSprints = initialSprint.completedSprints;

  // Per-sprint item lists keyed by sprint id, plus the backlog list.
  const initialMap: Record<string, IssueListItemDto[]> = {};
  for (const s of initialSprint.sprints) initialMap[s.sprint.id] = s.items;

  const [sprintItems, setSprintItems] =
    useState<Record<string, IssueListItemDto[]>>(initialMap);
  const [backlogItems, setBacklogItems] = useState<IssueListItemDto[]>(initialBacklog.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initialBacklog.nextCursor);
  const [activeItem, setActiveItem] = useState<IssueListItemDto | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState("backlog");
  const [bulkBusy, setBulkBusy] = useState(false);
  // Backlog "Group by epic" view (ADR-0026) — a view preference, local only.
  // Backlog filter (ADR-0008, shared with the Board). Server-applied: the
  // client never filters a page it already has, because the backlog is
  // keyset-paginated and a client-side filter would only narrow page one.
  const [filter, setFilter] = useState<IssueFilter>({});
  const [filtering, setFiltering] = useState(false);
  const [total, setTotal] = useState<number>(initialBacklog.total);
  const filterActive = isIssueFilterActive(filter);
  // Rank is a position in the WHOLE backlog. With rows hidden by a filter, a
  // drop between two visible rows means something the user did not intend, so
  // reordering is off until the filter is cleared (the note below says why).
  const backlogDraggable = canWrite && !filterActive;
  const [groupByEpic, setGroupByEpic] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  // Re-sync from fresh server props after a lifecycle refresh (create/start/
  // complete/delete/edit) — see ADR-0014 follow-up. Guarded by a signature so a
  // plain re-render (or an optimistic drag, which doesn't refresh) never wipes
  // local state.
  const propSig = JSON.stringify({
    s: initialSprint.sprints.map((x) => [x.sprint.id, x.sprint.status, x.items.map((i) => i.id)]),
    c: initialSprint.completedSprints.map((x) => x.id),
    bi: initialBacklog.items.map((i) => i.id),
    nc: initialBacklog.nextCursor,
  });
  const [syncedSig, setSyncedSig] = useState(propSig);
  if (propSig !== syncedSig) {
    setSyncedSig(propSig);
    const m: Record<string, IssueListItemDto[]> = {};
    for (const s of initialSprint.sprints) m[s.sprint.id] = s.items;
    setSprintItems(m);
    setBacklogItems(initialBacklog.items);
    setTotal(initialBacklog.total);
    setNextCursor(initialBacklog.nextCursor);
    setSelected(new Set());
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const readList = useCallback(
    (listId: ListId): IssueListItemDto[] => {
      if (listId === BACKLOG_LIST) return backlogItems;
      if (isBacklogGroup(listId)) {
        const epicId = epicOfGroup(listId);
        return backlogItems.filter((i) => (i.epicId ?? null) === epicId);
      }
      return sprintItems[sprintIdOf(listId)!] ?? [];
    },
    [backlogItems, sprintItems],
  );

  const listOf = useCallback(
    (cardId: string): ListId | null => {
      const backlogCard = backlogItems.find((i) => i.id === cardId);
      if (backlogCard) {
        // In grouped mode a backlog card belongs to its epic's group droppable.
        return groupByEpic ? backlogGroupId(backlogCard.epicId ?? null) : BACKLOG_LIST;
      }
      for (const sid of Object.keys(sprintItems)) {
        if (sprintItems[sid]!.some((i) => i.id === cardId)) return sprintListId(sid);
      }
      return null;
    },
    [backlogItems, sprintItems, groupByEpic],
  );

  const isListId = useCallback(
    (id: string): id is ListId =>
      id === BACKLOG_LIST ||
      isBacklogGroup(id) ||
      (id.startsWith(SPRINT_PREFIX) && sprintIdOf(id as ListId) !== null),
    [],
  );

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = String(event.active.id);
      const from = listOf(id);
      setActiveItem(from ? readList(from).find((i) => i.id === id) ?? null : null);
    },
    [listOf, readList],
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveItem(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const activeId = String(active.id);
      const overId = String(over.id);

      const from = listOf(activeId);
      if (!from) return;
      const to: ListId | null = isListId(overId) ? (overId as ListId) : listOf(overId);
      if (!to) return;

      const moved = readList(from).find((i) => i.id === activeId);
      if (!moved) return;

      // Neighbours within the DESTINATION's visible list (a sprint, the flat
      // backlog, or a single epic group — readList scopes it), active removed.
      const destVisible = readList(to).filter((i) => i.id !== activeId);
      const insertAt = isListId(overId)
        ? destVisible.length
        : (() => {
            const idx = destVisible.findIndex((i) => i.id === overId);
            return idx >= 0 ? idx : destVisible.length;
          })();
      const beforeId = destVisible[insertAt - 1]?.id ?? null;
      const afterId = destVisible[insertAt]?.id ?? null;

      const destSprintId = sprintIdOf(to); // null for any backlog list
      // Reassign the parent epic only when grouped and landing in a backlog
      // group; otherwise the epic is left unchanged (undefined = don't touch).
      const destEpicId: string | null | undefined =
        groupByEpic && isBacklogList(to) ? epicOfGroup(to) : undefined;

      const backlogSnapshot = backlogItems;
      const sprintSnapshot = sprintItems;
      const movedNew: IssueListItemDto = {
        ...moved,
        epicId: destEpicId !== undefined ? destEpicId : moved.epicId,
      };

      // Optimistic reconstruction of the FULL arrays (one rank space for the
      // backlog, ADR-0013). Insert relative to the destination neighbours so the
      // global order matches the rank the server will assign.
      const withoutActive = (list: IssueListItemDto[]) => list.filter((i) => i.id !== activeId);
      const insertRelative = (list: IssueListItemDto[]) => {
        const copy = withoutActive(list);
        let at = copy.length;
        if (beforeId) {
          const bi = copy.findIndex((i) => i.id === beforeId);
          if (bi >= 0) at = bi + 1;
        } else if (afterId) {
          const ai = copy.findIndex((i) => i.id === afterId);
          if (ai >= 0) at = ai;
        } else {
          at = 0; // empty destination group → front of the backlog
        }
        copy.splice(at, 0, movedNew);
        return copy;
      };

      const nextSprints: Record<string, IssueListItemDto[]> = {};
      for (const sid of Object.keys(sprintItems)) nextSprints[sid] = withoutActive(sprintItems[sid]!);
      let nextBacklog = withoutActive(backlogItems);
      if (destSprintId === null) nextBacklog = insertRelative(backlogItems);
      else nextSprints[destSprintId] = insertRelative(sprintItems[destSprintId] ?? []);

      setBacklogItems(nextBacklog);
      setSprintItems(nextSprints);

      const rollback = () => {
        setBacklogItems(backlogSnapshot);
        setSprintItems(sprintSnapshot);
      };

      try {
        const touchesSprint = !isBacklogList(from) || !isBacklogList(to);
        const epicField = destEpicId !== undefined ? { epicId: destEpicId } : {};
        const updated = touchesSprint
          ? await apiRequest<{ version: number }>(`/api/issues/${activeId}/sprint`, {
              method: "PATCH",
              body: { sprintId: destSprintId, beforeId, afterId, ...epicField, expectedVersion: moved.version },
            })
          : await apiRequest<{ version: number }>(`/api/issues/${activeId}/rank`, {
              method: "PATCH",
              body: { scope: "backlog", beforeId, afterId, ...epicField, expectedVersion: moved.version },
            });

        // Refresh the moved card's version wherever it now lives.
        const bump = (list: IssueListItemDto[]) =>
          list.map((i) => (i.id === activeId ? { ...i, version: updated.version } : i));
        if (destSprintId === null) setBacklogItems(bump);
        else setSprintItems((m) => ({ ...m, [destSprintId]: bump(m[destSprintId] ?? []) }));
      } catch (error) {
        rollback();
        toast.error(error instanceof Error ? error.message : "Couldn't move that issue.");
      }
    },
    [backlogItems, sprintItems, listOf, readList, isListId, groupByEpic],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const q = issueFilterToQuery(filter);
      q.set("cursor", nextCursor);
      const page = await apiRequest<BacklogDto>(
        `/api/projects/${projectId}/backlog?${q.toString()}`,
      );
      setBacklogItems((prev) => [...prev, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [projectId, nextCursor, loadingMore, filter]);

  // Applying a filter re-reads page ONE. The cursor is a position in the old
  // result set, so carrying it over would page into a list that no longer
  // exists — the classic keyset-plus-filter bug.
  const applyFilter = useCallback(
    async (next: IssueFilter) => {
      setFilter(next);
      setFiltering(true);
      try {
        const page = await apiRequest<BacklogDto>(
          `/api/projects/${projectId}/backlog?${issueFilterToQuery(next).toString()}`,
        );
        setBacklogItems(page.items);
        setNextCursor(page.nextCursor);
        setTotal(page.total);
        // A filtered list is a different set; a selection made against the old
        // one would bulk-move issues the user can no longer see.
        setSelected(new Set());
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't apply the filter.");
      } finally {
        setFiltering(false);
      }
    },
    [projectId],
  );

  const onChanged = useCallback(() => router.refresh(), [router]);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Backlog epic groups (ADR-0026): one per project epic (a drop target even
  // when empty) + a trailing "No epic" group. Items are the backlog filtered by
  // parent — the backlog stays one rank space (ADR-0013); this is a view.
  const backlogGroups = epics
    .map((e) => ({
      listId: backlogGroupId(e.id),
      epicKey: e.key as string | null,
      title: e.title,
      items: backlogItems.filter((i) => (i.epicId ?? null) === e.id),
    }))
    .concat({
      listId: backlogGroupId(null),
      epicKey: null,
      title: "No epic",
      items: backlogItems.filter((i) => !i.epicId),
    });

  // Planned-sprint queue order (FUT-8). Reorder = swap two planned sprints and
  // send the full planning order (ACTIVE ids first — they always sort first).
  const plannedIds = initialSprint.sprints
    .filter((s) => s.sprint.status === "PLANNED")
    .map((s) => s.sprint.id);
  const activeIds = initialSprint.sprints
    .filter((s) => s.sprint.status === "ACTIVE")
    .map((s) => s.sprint.id);

  // Plain function (not memoised): it must read the CURRENT plannedIds/activeIds
  // each render — a useCallback keyed on [projectId, router] would capture the
  // first (empty) render's arrays and silently no-op.
  const moveSprint = async (sprintId: string, direction: "up" | "down") => {
    const order = [...plannedIds];
    const i = order.indexOf(sprintId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j]!, order[i]!];
    try {
      await apiRequest(`/api/projects/${projectId}/sprints/order`, {
        method: "PATCH",
        body: { sprintIds: [...activeIds, ...order] },
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't reorder the sprints.");
    }
  };

  // Sprint targets a row can be moved into via the "…" menu (non-drag path).
  const sprintOptions = initialSprint.sprints.map((s) => ({
    id: s.sprint.id,
    name: s.sprint.name,
  }));

  // Menu-driven move: append the issue to the destination list's end, then
  // refresh (menu actions are infrequent — no optimistic bookkeeping needed).
  const moveViaMenu = useCallback(
    async (item: IssueListItemDto, targetSprintId: string | null) => {
      const destList = targetSprintId === null ? backlogItems : sprintItems[targetSprintId] ?? [];
      const beforeId = destList[destList.length - 1]?.id ?? null;
      try {
        await apiRequest(`/api/issues/${item.id}/sprint`, {
          method: "PATCH",
          body: { sprintId: targetSprintId, beforeId, afterId: null, expectedVersion: item.version },
        });
        router.refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Couldn't move that issue.");
      }
    },
    [backlogItems, sprintItems, router],
  );

  const rowMenu = useCallback(
    (item: IssueListItemDto, currentSprintId: string | null) =>
      canWrite ? (
        <RowMenu
          projectId={projectId}
          item={item}
          currentSprintId={currentSprintId}
          sprintOptions={sprintOptions}
          onMove={moveViaMenu}
        />
      ) : null,
    // sprintOptions is derived from props each render; safe to omit from deps.
    [canWrite, projectId, moveViaMenu], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // --- Bulk select + move (a power-user, non-drag path) ---
  const toggleSelect = useCallback((id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const rowLeading = useCallback(
    (item: IssueListItemDto) =>
      canWrite ? (
        <span onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}>
          <Checkbox
            aria-label={`Select ${item.key}`}
            checked={selected.has(item.id)}
            onCheckedChange={(v) => toggleSelect(item.id, v === true)}
          />
        </span>
      ) : null,
    [canWrite, selected, toggleSelect],
  );

  const bulkMove = useCallback(async () => {
    if (selected.size === 0 || bulkBusy) return;
    const targetSprintId = bulkTarget === "backlog" ? null : bulkTarget;
    const ids = [...selected];
    setBulkBusy(true);
    try {
      // Append each to the destination end, chaining so order is preserved.
      let prevId =
        targetSprintId === null
          ? backlogItems.at(-1)?.id ?? null
          : sprintItems[targetSprintId]?.at(-1)?.id ?? null;
      for (const id of ids) {
        const from = listOf(id);
        // Skip issues already in the destination (nothing to move).
        if (from === (targetSprintId === null ? BACKLOG_LIST : sprintListId(targetSprintId))) {
          continue;
        }
        const item = from ? readList(from).find((i) => i.id === id) : undefined;
        if (!item) continue;
        await apiRequest(`/api/issues/${id}/sprint`, {
          method: "PATCH",
          body: { sprintId: targetSprintId, beforeId: prevId, afterId: null, expectedVersion: item.version },
        });
        prevId = id;
      }
      toast.success(`Moved ${ids.length} ${ids.length === 1 ? "issue" : "issues"}`);
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't move the selected issues.");
    } finally {
      setBulkBusy(false);
    }
  }, [selected, bulkBusy, bulkTarget, backlogItems, sprintItems, listOf, readList, router]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {/* Sprint sections (ACTIVE first, then PLANNED) */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Sprints</h2>
        {canManage && <CreateSprintButton projectId={projectId} onChanged={onChanged} />}
      </div>

      {initialSprint.sprints.length === 0 ? (
        <p className="mb-6 rounded-xl border border-dashed border-border/60 bg-surface/40 px-6 py-8 text-center text-sm text-muted-foreground">
          {canManage
            ? "No sprints yet. Create one, then drag issues from the backlog to plan it."
            : "No sprints are planned yet."}
        </p>
      ) : (
        <div className="mb-6 flex flex-col gap-4">
          {initialSprint.sprints.map(({ sprint }) => (
            <SprintSection
              key={sprint.id}
              sprint={sprint}
              projectId={projectId}
              items={sprintItems[sprint.id] ?? []}
              canWrite={canWrite}
              canManage={canManage}
              onChanged={onChanged}
              completeTargets={initialSprint.sprints
                .filter((s) => s.sprint.status === "PLANNED" && s.sprint.id !== sprint.id)
                .map((s) => ({ id: s.sprint.id, name: s.sprint.name }))}
              queuePosition={
                sprint.status === "PLANNED"
                  ? {
                      canMoveUp: plannedIds.indexOf(sprint.id) > 0,
                      canMoveDown: plannedIds.indexOf(sprint.id) < plannedIds.length - 1,
                      onMove: (dir) => moveSprint(sprint.id, dir),
                    }
                  : null
              }
              renderLeading={rowLeading}
              renderTrailing={(item) => rowMenu(item, sprint.id)}
            />
          ))}
        </div>
      )}

      {/* Backlog section */}
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
            Backlog
            {/* Count under the active filter. The list is keyset-paginated, so
                without the server's total this could only say "50 loaded". */}
            <span className="text-xs font-normal text-muted-foreground">
              {filterActive ? `${total} matching` : `${total}`}
            </span>
            {filtering && (
              <span className="text-xs font-normal text-muted-foreground">Filtering…</span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Group by</span>
            <Select
              value={groupByEpic ? "epic" : "none"}
              onValueChange={(v) => setGroupByEpic(v === "epic")}
            >
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="epic">Epic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* The same composable filter the Board uses (ADR-0008) — one type, one
            parser, one `where`. `sprints` is deliberately omitted: the backlog
            IS the unsprinted set, so a sprint filter here is meaningless. */}
        <BoardFilterBar
          members={members}
          labels={labels}
          components={components}
          epics={epics}
          filter={filter}
          onChange={applyFilter}
        />

        {/* Reordering a filtered backlog is disabled on purpose. Rank is a
            position in the FULL list; dropping between two visible rows when
            hidden rows sit between them does something the user did not mean.
            Jira takes the same line. Clearing the filter restores dragging. */}
        {filterActive && canWrite && (
          <p className="mb-2 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
            Reordering is off while a filter is active — rank is a position in the
            whole backlog, and hidden rows sit between the ones you can see.
          </p>
        )}

        {backlogItems.length === 0 && filterActive && (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            No unscheduled issues match this filter.
          </p>
        )}

        {groupByEpic ? (
          <div className="flex flex-col gap-3">
            {backlogGroups.map((g) => (
              <BacklogGroup
                key={g.listId}
                group={g}
                collapsed={collapsedGroups.has(g.listId)}
                onToggle={() => toggleCollapse(g.listId)}
                projectId={projectId}
                canWrite={backlogDraggable}
                renderLeading={rowLeading}
                renderTrailing={(item) => rowMenu(item, null)}
              />
            ))}
          </div>
        ) : (
          <DroppableList
            listId={BACKLOG_LIST}
            projectId={projectId}
            items={backlogItems}
            canWrite={backlogDraggable}
            emptyText="The backlog is empty — new issues land here until they're scheduled."
            renderLeading={rowLeading}
            renderTrailing={(item) => rowMenu(item, null)}
          />
        )}
        {canWrite && <InlineCreateIssue projectId={projectId} onCreated={onChanged} />}
        {nextCursor && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </section>

      {/* Completed sprints (history) */}
      {completedSprints.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Completed sprints</h2>
          <div className="flex flex-col gap-2">
            {completedSprints.map((s) => (
              <CompletedSprintCard
                key={s.id}
                sprint={s}
                canManage={canManage}
                onChanged={onChanged}
              />
            ))}
          </div>
        </section>
      )}

      <DragOverlay>
        {activeItem && (
          <BacklogItem projectId={projectId} item={activeItem} canWrite={canWrite} overlay />
        )}
      </DragOverlay>

      {/* Bulk action bar — appears while issues are selected */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Move to</span>
            <Select value={bulkTarget} onValueChange={setBulkTarget}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">Backlog</SelectItem>
                {sprintOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" onClick={bulkMove} loading={bulkBusy}>
              Move
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}
    </DndContext>
  );
}

function SprintSection({
  sprint,
  projectId,
  items,
  canWrite,
  canManage,
  onChanged,
  completeTargets,
  queuePosition,
  renderLeading,
  renderTrailing,
}: {
  sprint: SprintWithProgressDto;
  projectId: string;
  items: IssueListItemDto[];
  canWrite: boolean;
  canManage: boolean;
  onChanged: () => void;
  completeTargets: { id: string; name: string }[];
  queuePosition: {
    canMoveUp: boolean;
    canMoveDown: boolean;
    onMove: (direction: "up" | "down") => void;
  } | null;
  renderLeading?: (item: IssueListItemDto) => React.ReactNode;
  renderTrailing?: (item: IssueListItemDto) => React.ReactNode;
}) {
  const done = items.filter((i) => i.status === "DONE").length;
  const total = items.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const overdue =
    sprint.status === "ACTIVE" && sprint.endDate ? new Date(sprint.endDate) < new Date() : false;

  return (
    <section className="rounded-xl border border-border/60 bg-surface/20 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{sprint.name}</h3>
          <Badge variant={sprint.status === "ACTIVE" ? "accent" : "outline"}>
            {sprint.status === "ACTIVE" ? "Active" : "Planned"}
          </Badge>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {queuePosition && (canManage) && (
              <div className="flex items-center">
                <button
                  type="button"
                  aria-label="Move sprint up"
                  disabled={!queuePosition.canMoveUp}
                  onClick={() => queuePosition.onMove("up")}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Move sprint down"
                  disabled={!queuePosition.canMoveDown}
                  onClick={() => queuePosition.onMove("down")}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            )}
            <EditSprintButton sprint={sprint} onChanged={onChanged} />
            <DeleteSprintButton sprint={sprint} onChanged={onChanged} />
            {sprint.status === "PLANNED" && (
              <StartSprintButton sprint={sprint} onChanged={onChanged} />
            )}
            {sprint.status === "ACTIVE" && (
              <CompleteSprintButton
                sprint={sprint}
                targets={completeTargets}
                onChanged={onChanged}
              />
            )}
          </div>
        )}
      </div>

      {sprint.goal && <p className="mb-2 text-sm text-muted-foreground">{sprint.goal}</p>}
      <p className="mb-2 text-xs text-muted-foreground">
        {sprint.startDate || sprint.endDate ? formatDateRange(sprint.startDate, sprint.endDate) : "No dates set"}
        {durationDays(sprint.startDate, sprint.endDate) !== null && (
          <span className="ml-2">· {durationDays(sprint.startDate, sprint.endDate)} days</span>
        )}
        <span className="ml-2">· {total} {total === 1 ? "issue" : "issues"}</span>
        {overdue && <span className="ml-2 font-medium text-destructive">Overdue</span>}
      </p>
      <div className="mb-3 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {done}/{total} done
        </span>
      </div>

      <DroppableList
        listId={sprintListId(sprint.id)}
        projectId={projectId}
        items={items}
        canWrite={canWrite}
        emptyText="Drag issues here to plan this sprint."
        renderLeading={renderLeading}
        renderTrailing={renderTrailing}
      />
    </section>
  );
}

function durationDays(startIso: string | null, endIso: string | null): number | null {
  if (!startIso || !endIso) return null;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms <= 0) return null;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function formatDateRange(startIso: string | null, endIso: string | null): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (startIso && endIso) return `${fmt(startIso)} – ${fmt(endIso)}`;
  if (startIso) return `Starts ${fmt(startIso)}`;
  if (endIso) return `Ends ${fmt(endIso)}`;
  return "";
}

// A completed sprint in the history section: name, dates, final progress, and a
// delete control (LEAD). Read-only otherwise — its issue set is the record.
function CompletedSprintCard({
  sprint,
  canManage,
  onChanged,
}: {
  sprint: SprintWithProgressDto;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { doneIssues, totalIssues } = sprint.progress;
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-surface/30 px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{sprint.name}</span>
          <Badge variant="outline">Completed</Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatDateRange(sprint.startDate, sprint.endDate)}
          {sprint.startDate || sprint.endDate ? " · " : ""}
          {doneIssues}/{totalIssues} done
        </span>
      </div>
      {canManage && <DeleteSprintButton sprint={sprint} onChanged={onChanged} />}
    </div>
  );
}

function DroppableList({
  listId,
  projectId,
  items,
  canWrite,
  emptyText,
  showEpic = true,
  renderLeading,
  renderTrailing,
}: {
  listId: ListId;
  projectId: string;
  items: IssueListItemDto[];
  canWrite: boolean;
  emptyText: string;
  // Suppress the per-row epic badge where the surrounding group already names
  // the epic (grouped backlog). Shown by default (sprints, flat backlog).
  showEpic?: boolean;
  renderLeading?: (item: IssueListItemDto) => React.ReactNode;
  renderTrailing?: (item: IssueListItemDto) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: listId });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-16 flex-col gap-2 rounded-xl border border-border/60 bg-surface/30 p-2 transition-colors",
        isOver && "border-accent/50 bg-accent/5",
      )}
    >
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item) => (
          <BacklogItem
            key={item.id}
            projectId={projectId}
            item={item}
            canWrite={canWrite}
            showEpic={showEpic}
            leading={renderLeading?.(item)}
            trailing={renderTrailing?.(item)}
          />
        ))}
      </SortableContext>
      {items.length === 0 && (
        <p className="px-1 py-6 text-center text-xs text-muted-foreground">{emptyText}</p>
      )}
    </div>
  );
}

// A collapsible backlog epic group (ADR-0026): header (epic key/title or "No
// epic" + count) over a droppable list. Rows omit the epic badge — the header
// already states it. Dropping a card here reassigns its parent epic.
function BacklogGroup({
  group,
  collapsed,
  onToggle,
  projectId,
  canWrite,
  renderLeading,
  renderTrailing,
}: {
  group: { listId: ListId; epicKey: string | null; title: string; items: IssueListItemDto[] };
  collapsed: boolean;
  onToggle: () => void;
  projectId: string;
  canWrite: boolean;
  renderLeading?: (item: IssueListItemDto) => React.ReactNode;
  renderTrailing?: (item: IssueListItemDto) => React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface/20 p-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="mb-2 flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", collapsed && "-rotate-90")} />
        {group.epicKey ? (
          <span className="flex min-w-0 items-center gap-2">
            <IssueTypeIcon type="EPIC" className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono text-xs text-muted-foreground">{group.epicKey}</span>
            <span className="truncate text-sm font-medium text-foreground">{group.title}</span>
          </span>
        ) : (
          <span className="text-sm font-medium text-foreground">No epic</span>
        )}
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{group.items.length}</span>
      </button>
      {!collapsed && (
        <DroppableList
          listId={group.listId}
          projectId={projectId}
          items={group.items}
          canWrite={canWrite}
          showEpic={false}
          emptyText={
            group.epicKey ? "Drag issues here to add them to this epic." : "Issues with no epic."
          }
          renderLeading={renderLeading}
          renderTrailing={renderTrailing}
        />
      )}
    </div>
  );
}

// Per-row "…" actions menu (the non-drag path): open the issue, and move it
// between the backlog and any sprint via the move endpoint (ADR-0014).
function RowMenu({
  projectId,
  item,
  currentSprintId,
  sprintOptions,
  onMove,
}: {
  projectId: string;
  item: IssueListItemDto;
  currentSprintId: string | null;
  sprintOptions: { id: string; name: string }[];
  onMove: (item: IssueListItemDto, targetSprintId: string | null) => void;
}) {
  const addTargets = sprintOptions.filter((s) => s.id !== currentSprintId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Issue actions"
        // Don't let the trigger start a drag on the row.
        onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link href={`/projects/${projectId}/issues/${item.id}`}>Open issue</Link>
        </DropdownMenuItem>
        {currentSprintId !== null && (
          <DropdownMenuItem onSelect={() => onMove(item, null)}>
            Remove from sprint
          </DropdownMenuItem>
        )}
        {addTargets.map((s) => (
          <DropdownMenuItem key={s.id} onSelect={() => onMove(item, s.id)}>
            Move to {s.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
